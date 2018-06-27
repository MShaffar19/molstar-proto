/**
 * Copyright (c) 2017-2018 Mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import Model from '../../../model'
import { LinkType } from '../../../types'
import { ModelPropertyDescriptor } from '../../../properties/custom';
import { mmCIF_Database } from 'mol-io/reader/cif/schema/mmcif';
import { Structure, Unit, StructureProperties, Element } from '../../../../structure';
import { Segmentation } from 'mol-data/int';
import { CifWriter } from 'mol-io/writer/cif'

export interface ComponentBond {
    entries: Map<string, ComponentBond.Entry>
}

export namespace ComponentBond {
    export const Descriptor: ModelPropertyDescriptor = {
        isStatic: true,
        name: 'chem_comp_bond',
        cifExport: {
            categoryNames: ['chem_comp_bond'],
            categoryProvider(ctx) {
                const comp_names = getUniqueResidueNames(ctx.structure);
                const chem_comp_bond = getChemCompBond(ctx.model);

                if (!chem_comp_bond) return [];

                const { comp_id, _rowCount } = chem_comp_bond;
                const indices: number[] = [];
                for (let i = 0; i < _rowCount; i++) {
                    if (comp_names.has(comp_id.value(i))) indices[indices.length] = i;
                }

                return [
                    () => CifWriter.Category.ofTable('chem_comp_bond', chem_comp_bond, indices)
                ];
            }
        }
    }

    export function attachFromMmCif(model: Model): boolean {
        if (model.sourceData.kind !== 'mmCIF') return false;
        const { chem_comp_bond } = model.sourceData.data;
        if (chem_comp_bond._rowCount === 0) return false;
        model.customProperties.add(Descriptor);
        model._staticPropertyData.__ComponentBondData__ = chem_comp_bond;
        return true;
    }

    export class ComponentBondImpl implements ComponentBond {
        entries: Map<string, ComponentBond.Entry> = new Map();

        addEntry(id: string) {
            let e = new Entry(id);
            this.entries.set(id, e);
            return e;
        }
    }

    export class Entry implements Entry {
        map: Map<string, Map<string, { order: number, flags: number }>> = new Map();

        add(a: string, b: string, order: number, flags: number, swap = true) {
            let e = this.map.get(a);
            if (e !== void 0) {
                let f = e.get(b);
                if (f === void 0) {
                    e.set(b, { order, flags });
                }
            } else {
                let map = new Map<string, { order: number, flags: number }>();
                map.set(b, { order, flags });
                this.map.set(a, map);
            }

            if (swap) this.add(b, a, order, flags, false);
        }

        constructor(public id: string) {
        }
    }

    function getChemCompBond(model: Model) {
        return model._staticPropertyData.__ComponentBondData__ as mmCIF_Database['chem_comp_bond'];
    }

    export const PropName = '__ComponentBond__';
    export function get(model: Model): ComponentBond | undefined {
        if (model._staticPropertyData[PropName]) return model._staticPropertyData[PropName];
        if (!model.customProperties.has(Descriptor)) return void 0;
        const chem_comp_bond = getChemCompBond(model);

        let compBond = new ComponentBondImpl();

        const { comp_id, atom_id_1, atom_id_2, value_order, pdbx_aromatic_flag, _rowCount: rowCount } = chem_comp_bond;

        let entry = compBond.addEntry(comp_id.value(0)!);

        for (let i = 0; i < rowCount; i++) {

            const id = comp_id.value(i)!;
            const nameA = atom_id_1.value(i)!;
            const nameB = atom_id_2.value(i)!;
            const order = value_order.value(i)!;
            const aromatic = pdbx_aromatic_flag.value(i) === 'Y';

            if (entry.id !== id) {
                entry = compBond.addEntry(id);
            }

            let flags: number = LinkType.Flag.Covalent;
            let ord = 1;
            if (aromatic) flags |= LinkType.Flag.Aromatic;
            switch (order.toLowerCase()) {
                case 'doub':
                case 'delo':
                    ord = 2;
                    break;
                case 'trip': ord = 3; break;
                case 'quad': ord = 4; break;
            }

            entry.add(nameA, nameB, ord, flags);
        }

        model._staticPropertyData[PropName] = compBond;
        return compBond;
    }

    function getUniqueResidueNames(s: Structure) {
        const prop = StructureProperties.residue.label_comp_id;
        const names = new Set<string>();
        const loc = Element.Location();
        for (const unit of s.units) {
            if (!Unit.isAtomic(unit)) continue;
            const residues = Segmentation.transientSegments(unit.model.atomicHierarchy.residueSegments, unit.elements);
            loc.unit = unit;
            while (residues.hasNext) {
                const seg = residues.move();
                loc.element = seg.start;
                names.add(prop(loc));
            }
        }
        return names;
    }
}