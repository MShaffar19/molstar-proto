/**
 * Copyright (c) 2017-2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { IntMap, SortedArray, Iterator, Segmentation } from 'mol-data/int'
import { UniqueArray } from 'mol-data/generic'
import { SymmetryOperator } from 'mol-math/geometry/symmetry-operator'
import { Model, ElementIndex } from '../model'
import { sort, arraySwap, hash1, sortArray, hashString } from 'mol-data/util';
import StructureElement from './element'
import Unit from './unit'
import { StructureLookup3D } from './util/lookup3d';
import { CoarseElements } from '../model/properties/coarse';
import { StructureSubsetBuilder } from './util/subset-builder';
import { InterUnitBonds, computeInterUnitBonds } from './unit/links';
import { PairRestraints, CrossLinkRestraint, extractCrossLinkRestraints } from './unit/pair-restraints';
import StructureSymmetry from './symmetry';
import StructureProperties from './properties';
import { ResidueIndex, ChainIndex } from '../model/indexing';
import { Carbohydrates } from './carbohydrates/data';
import { computeCarbohydrates } from './carbohydrates/compute';
import { Vec3 } from 'mol-math/linear-algebra';
import { idFactory } from 'mol-util/id-factory';
import { GridLookup3D } from 'mol-math/geometry';

class Structure {
    /** Maps unit.id to unit */
    readonly unitMap: IntMap<Unit>;
    /** Array of all units in the structure, sorted by unit.id */
    readonly units: ReadonlyArray<Unit>;

    private _props: {
        lookup3d?: StructureLookup3D,
        links?: InterUnitBonds,
        crossLinkRestraints?: PairRestraints<CrossLinkRestraint>,
        unitSymmetryGroups?: ReadonlyArray<Unit.SymmetryGroup>,
        carbohydrates?: Carbohydrates,
        models?: ReadonlyArray<Model>,
        hashCode: number,
        elementCount: number,
        polymerResidueCount: number,
    } = { hashCode: -1, elementCount: 0, polymerResidueCount: 0 };

    subsetBuilder(isSorted: boolean) {
        return new StructureSubsetBuilder(this, isSorted);
    }

    /** Count of all elements in the structure, i.e. the sum of the elements in the units */
    get elementCount() {
        return this._props.elementCount;
    }

    /** Count of all polymer residues in the structure */
    get polymerResidueCount() {
        return this._props.polymerResidueCount;
    }

    /** Coarse structure, defined as Containing less than twice as many elements as polymer residues */
    get isCoarse() {
        const ec = this.elementCount
        const prc = this.polymerResidueCount
        return prc && ec ? ec / prc < 2 : false
    }

    get hashCode() {
        if (this._props.hashCode !== -1) return this._props.hashCode;
        return this.computeHash();
    }

    private computeHash() {
        let hash = 23;
        for (let i = 0, _i = this.units.length; i < _i; i++) {
            const u = this.units[i];
            hash = (31 * hash + u.id) | 0;
            hash = (31 * hash + SortedArray.hashCode(u.elements)) | 0;
        }
        hash = (31 * hash + this.elementCount) | 0;
        hash = hash1(hash);
        if (hash === -1) hash = 0;
        this._props.hashCode = hash;
        return hash;
    }

    /** Returns a new element location iterator */
    elementLocations(): Iterator<StructureElement> {
        return new Structure.ElementLocationIterator(this);
    }

    get boundary() {
        return this.lookup3d.boundary;
    }

    get lookup3d() {
        if (this._props.lookup3d) return this._props.lookup3d;
        this._props.lookup3d = new StructureLookup3D(this);
        return this._props.lookup3d;
    }

    get links() {
        if (this._props.links) return this._props.links;
        this._props.links = computeInterUnitBonds(this);
        return this._props.links;
    }

    get crossLinkRestraints() {
        if (this._props.crossLinkRestraints) return this._props.crossLinkRestraints;
        this._props.crossLinkRestraints = extractCrossLinkRestraints(this);
        return this._props.crossLinkRestraints;
    }

    get unitSymmetryGroups(): ReadonlyArray<Unit.SymmetryGroup> {
        if (this._props.unitSymmetryGroups) return this._props.unitSymmetryGroups;
        this._props.unitSymmetryGroups = StructureSymmetry.computeTransformGroups(this);
        return this._props.unitSymmetryGroups;
    }

    get carbohydrates(): Carbohydrates {
        if (this._props.carbohydrates) return this._props.carbohydrates;
        this._props.carbohydrates = computeCarbohydrates(this);
        return this._props.carbohydrates;
    }

    get models(): ReadonlyArray<Model> {
        if (this._props.models) return this._props.models;
        this._props.models = getModels(this);
        return this._props.models;
    }

    hasElement(e: StructureElement) {
        if (!this.unitMap.has(e.unit.id)) return false;
        return SortedArray.has(this.unitMap.get(e.unit.id).elements, e.element);
    }

    constructor(units: ArrayLike<Unit>) {
        const map = IntMap.Mutable<Unit>();
        let elementCount = 0;
        let polymerResidueCount = 0;
        let isSorted = true;
        let lastId = units.length > 0 ? units[0].id : 0;
        for (let i = 0, _i = units.length; i < _i; i++) {
            const u = units[i];
            map.set(u.id, u);
            elementCount += u.elements.length;
            polymerResidueCount += u.polymerElements.length;
            if (u.id < lastId) isSorted = false;
            lastId = u.id;
        }
        if (!isSorted) sort(units, 0, units.length, cmpUnits, arraySwap)
        this.unitMap = map;
        this.units = units as ReadonlyArray<Unit>;
        this._props.elementCount = elementCount;
        this._props.polymerResidueCount = polymerResidueCount;
    }
}

function cmpUnits(units: ArrayLike<Unit>, i: number, j: number) { return units[i].id - units[j].id; }

function getModels(s: Structure) {
    const { units } = s;
    const arr = UniqueArray.create<Model['id'], Model>();
    for (const u of units) {
        UniqueArray.add(arr, u.model.id, u.model);
    }
    return arr.array;
}

namespace Structure {
    export const Empty = new Structure([]);

    export function create(units: ReadonlyArray<Unit>): Structure { return new Structure(units); }

    /**
     * Construct a Structure from a model.
     *
     * Generally, a single unit corresponds to a single chain, with the exception
     * of consecutive "single atom chains".
     */
    export function ofModel(model: Model): Structure {
        const chains = model.atomicHierarchy.chainAtomSegments;
        const builder = new StructureBuilder();

        for (let c = 0; c < chains.count; c++) {
            const start = chains.offsets[c];

            // merge all consecutive "single atom chains"
            while (c + 1 < chains.count
                && chains.offsets[c + 1] - chains.offsets[c] === 1
                && chains.offsets[c + 2] - chains.offsets[c + 1] === 1) {
                c++;
            }

            const elements = SortedArray.ofBounds(start as ElementIndex, chains.offsets[c + 1] as ElementIndex);

            if (isWaterChain(model, c as ChainIndex, elements)) {
                partitionAtomicUnit(model, elements, builder);
            } else {
                builder.addUnit(Unit.Kind.Atomic, model, SymmetryOperator.Default, elements);
            }
        }

        const cs = model.coarseHierarchy;
        if (cs.isDefined) {
            if (cs.spheres.count > 0) {
                addCoarseUnits(builder, model, model.coarseHierarchy.spheres, Unit.Kind.Spheres);
            }
            if (cs.gaussians.count > 0) {
                addCoarseUnits(builder, model, model.coarseHierarchy.gaussians, Unit.Kind.Gaussians);
            }
        }

        return builder.getStructure();
    }

    function isWaterChain(model: Model, chainIndex: ChainIndex, indices: SortedArray) {
        const e = model.atomicHierarchy.index.getEntityFromChain(chainIndex);
        return model.entities.data.type.value(e) === 'water';
    }

    function partitionAtomicUnit(model: Model, indices: SortedArray, builder: StructureBuilder) {
        const { x, y, z } = model.atomicConformation;
        const lookup = GridLookup3D({ x, y, z, indices }, Vec3.create(64, 64, 64));
        const { offset, count, array } = lookup.buckets;

        for (let i = 0, _i = offset.length; i < _i; i++) {
            const start = offset[i];
            const set = new Int32Array(count[i]);
            for (let j = 0, _j = count[i]; j < _j; j++) {
                set[j] = indices[array[start + j]];
            }
            builder.addUnit(Unit.Kind.Atomic, model, SymmetryOperator.Default, SortedArray.ofSortedArray(set));
        }
    }

    function addCoarseUnits(builder: StructureBuilder, model: Model, elements: CoarseElements, kind: Unit.Kind) {
        const { chainElementSegments } = elements;
        for (let cI = 0; cI < chainElementSegments.count; cI++) {
            const elements = SortedArray.ofBounds<ElementIndex>(chainElementSegments.offsets[cI], chainElementSegments.offsets[cI + 1]);
            builder.addUnit(kind, model, SymmetryOperator.Default, elements);
        }
    }

    export class StructureBuilder {
        private units: Unit[] = [];
        private invariantId = idFactory()

        addUnit(kind: Unit.Kind, model: Model, operator: SymmetryOperator, elements: StructureElement.Set): Unit {
            const unit = Unit.create(this.units.length, this.invariantId(), kind, model, operator, elements);
            this.units.push(unit);
            return unit;
        }

        addWithOperator(unit: Unit, operator: SymmetryOperator): Unit {
            const newUnit = unit.applyOperator(this.units.length, operator);
            this.units.push(newUnit);
            return newUnit;
        }

        getStructure(): Structure {
            return create(this.units);
        }

        get isEmpty() {
            return this.units.length === 0;
        }
    }

    export function Builder() { return new StructureBuilder(); }

    export function hashCode(s: Structure) {
        return s.hashCode;
    }

    export function conformationHash(s: Structure) {
        return hashString(s.units.map(u => Unit.conformationId(u)).join('|'))
    }

    export function areEqual(a: Structure, b: Structure) {
        if (a.elementCount !== b.elementCount) return false;
        const len = a.units.length;
        if (len !== b.units.length) return false;

        for (let i = 0; i < len; i++) {
            if (a.units[i].id !== b.units[i].id) return false;
        }

        for (let i = 0; i < len; i++) {
            if (!SortedArray.areEqual(a.units[i].elements, b.units[i].elements)) return false;
        }

        return true;
    }

    export class ElementLocationIterator implements Iterator<StructureElement> {
        private current = StructureElement.create();
        private unitIndex = 0;
        private elements: StructureElement.Set;
        private maxIdx = 0;
        private idx = -1;

        hasNext: boolean;
        move(): StructureElement {
            this.advance();
            this.current.element = this.elements[this.idx];
            return this.current;
        }

        private advance() {
            if (this.idx < this.maxIdx) {
                this.idx++;

                if (this.idx === this.maxIdx) this.hasNext = this.unitIndex + 1 < this.structure.units.length;
                return;
            }

            this.idx = 0;
            this.unitIndex++;
            if (this.unitIndex >= this.structure.units.length) {
                this.hasNext = false;
                return;
            }

            this.current.unit = this.structure.units[this.unitIndex];
            this.elements = this.current.unit.elements;
            this.maxIdx = this.elements.length - 1;
        }

        constructor(private structure: Structure) {
            this.hasNext = structure.elementCount > 0;
            if (this.hasNext) {
                this.elements = structure.units[0].elements;
                this.maxIdx = this.elements.length - 1;
                this.current.unit = structure.units[0];
            }
        }
    }

    export function getEntityKeys(structure: Structure) {
        const { units } = structure;
        const l = StructureElement.create();
        const keys = UniqueArray.create<number, number>();

        for (const unit of units) {
            const prop = unit.kind === Unit.Kind.Atomic ? StructureProperties.entity.key : StructureProperties.coarse.entityKey;

            l.unit = unit;
            const elements = unit.elements;

            const chainsIt = Segmentation.transientSegments(unit.model.atomicHierarchy.chainAtomSegments, elements);
            while (chainsIt.hasNext) {
                const chainSegment = chainsIt.move();
                l.element = elements[chainSegment.start];
                const key = prop(l);
                UniqueArray.add(keys, key, key);
            }
        }

        sortArray(keys.array);
        return keys.array;
    }

    export function getUniqueAtomicResidueIndices(structure: Structure, model: Model): ReadonlyArray<ResidueIndex> {
        const uniqueResidues = UniqueArray.create<ResidueIndex, ResidueIndex>();
        const unitGroups = structure.unitSymmetryGroups;
        for (const unitGroup of unitGroups) {
            const unit = unitGroup.units[0];
            if (unit.model !== model || !Unit.isAtomic(unit)) {
                continue;
            }

            const residues = Segmentation.transientSegments(unit.model.atomicHierarchy.residueAtomSegments, unit.elements);
            while (residues.hasNext) {
                const seg = residues.move();
                UniqueArray.add(uniqueResidues, seg.index, seg.index);
            }
        }
        sortArray(uniqueResidues.array);
        return uniqueResidues.array;
    }

    const distVec = Vec3.zero();
    function unitElementMinDistance(unit: Unit, p: Vec3, eRadius: number) {
        const { elements, conformation: { position, r } } = unit, dV = distVec;
        let minD = Number.MAX_VALUE;
        for (let i = 0, _i = elements.length; i < _i; i++) {
            const e = elements[i];
            const d = Vec3.distance(p, position(e, dV)) - eRadius - r(e);
            if (d < minD) minD = d;
        }
        return minD;
    }

    export function minDistanceToPoint(s: Structure, point: Vec3, radius: number) {
        const { units } = s;
        let minD = Number.MAX_VALUE;
        for (let i = 0, _i = units.length; i < _i; i++) {
            const unit = units[i];
            const d = unitElementMinDistance(unit, point, radius);
            if (d < minD) minD = d;
        }
        return minD;
    }

    const distPivot = Vec3.zero();
    export function distance(a: Structure, b: Structure) {
        if (a.elementCount === 0 || b.elementCount === 0) return 0;

        const { units } = a;
        let minD = Number.MAX_VALUE;

        for (let i = 0, _i = units.length; i < _i; i++) {
            const unit = units[i];
            const { elements, conformation: { position, r } } = unit;
            for (let i = 0, _i = elements.length; i < _i; i++) {
                const e = elements[i];
                const d = minDistanceToPoint(b, position(e, distPivot), r(e));
                if (d < minD) minD = d;
            }
        }
        return minD;
    }
}

export default Structure