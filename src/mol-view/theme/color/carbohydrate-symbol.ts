/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StructureElement, Link, ElementIndex, Unit } from 'mol-model/structure';

import { SaccharideColors, MonosaccharidesColorTable } from 'mol-model/structure/structure/carbohydrates/constants';
import { Location } from 'mol-model/location';
import { ColorThemeProps, ColorTheme, LocationColor, TableLegend } from '../color';
import { Color } from 'mol-util/color';

const DefaultColor = Color(0xCCCCCC)
const Description = 'Assigns colors according to the Symbol Nomenclature for Glycans (SNFG).'

export function CarbohydrateSymbolColorTheme(props: ColorThemeProps): ColorTheme {
    let color: LocationColor

    if (props.structure) {
        const { elements, getElementIndex, getAnomericCarbon } = props.structure.carbohydrates

        const getColor = (unit: Unit, index: ElementIndex) => {
            const residueIndex = unit.model.atomicHierarchy.residueAtomSegments.index[index]
            const anomericCarbon = getAnomericCarbon(unit, residueIndex)
            if (anomericCarbon !== undefined) {
                const idx = getElementIndex(unit, anomericCarbon)
                if (idx !== undefined) return elements[idx].component.color
            }
            return DefaultColor
        }

        color = (location: Location, isSecondary: boolean) => {
            if (isSecondary) {
                return SaccharideColors.Secondary
            } else {
                if (StructureElement.isLocation(location)) {
                    return getColor(location.unit, location.element)
                } else if (Link.isLocation(location)) {
                    return getColor(location.aUnit, location.aUnit.elements[location.aIndex])
                }
            }
            return DefaultColor
        }
    } else {
        color = () => DefaultColor
    }

    return {
        granularity: 'group',
        color: color,
        description: Description,
        legend: TableLegend(MonosaccharidesColorTable)
    }
}