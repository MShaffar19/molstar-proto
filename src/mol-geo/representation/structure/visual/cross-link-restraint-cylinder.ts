/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Link, Structure, StructureElement } from 'mol-model/structure';
import { ComplexVisual, VisualUpdateState } from '..';
import { RuntimeContext } from 'mol-task'
import { LinkCylinderProps, DefaultLinkCylinderProps, createLinkCylinderMesh } from './util/link';
import { Mesh } from '../../../geometry/mesh/mesh';
import { PickingId } from '../../../geometry/picking';
import { Vec3 } from 'mol-math/linear-algebra';
import { Loci, EmptyLoci } from 'mol-model/loci';
import { ComplexMeshVisual, DefaultComplexMeshProps } from '../complex-visual';
import { LocationIterator } from '../../../util/location-iterator';
import { Interval } from 'mol-data/int';
import { SizeThemeProps, SizeTheme } from 'mol-view/theme/size';
import { BitFlags } from 'mol-util';
import { LinkType } from 'mol-model/structure/model/types';

async function createCrossLinkRestraintCylinderMesh(ctx: RuntimeContext, structure: Structure, props: LinkCylinderProps, mesh?: Mesh) {

    const crossLinks = structure.crossLinkRestraints
    if (!crossLinks.count) return Mesh.createEmpty(mesh)

    const sizeTheme = SizeTheme(props.sizeTheme)
    const location = StructureElement.create()

    const builderProps = {
        linkCount: crossLinks.count,
        referencePosition: () => null,
        position: (posA: Vec3, posB: Vec3, edgeIndex: number) => {
            const b = crossLinks.pairs[edgeIndex]
            const uA = b.unitA, uB = b.unitB
            uA.conformation.position(uA.elements[b.indexA], posA)
            uB.conformation.position(uB.elements[b.indexB], posB)
        },
        order: () => 1,
        flags: () => BitFlags.create(LinkType.Flag.None),
        radius: (edgeIndex: number) => {
            const b = crossLinks.pairs[edgeIndex]
            location.unit = b.unitA
            location.element = b.unitA.elements[b.indexA]
            return sizeTheme.size(location)
        }
    }

    return createLinkCylinderMesh(ctx, builderProps, props, mesh)
}

export const DefaultCrossLinkRestraintProps = {
    ...DefaultComplexMeshProps,
    ...DefaultLinkCylinderProps,
    sizeTheme: { name: 'physical', factor: 0.3 } as SizeThemeProps,
    flipSided: false,
    flatShaded: false,
}
export type CrossLinkRestraintProps = typeof DefaultCrossLinkRestraintProps

export function CrossLinkRestraintVisual(): ComplexVisual<CrossLinkRestraintProps> {
    return ComplexMeshVisual<CrossLinkRestraintProps>({
        defaultProps: DefaultCrossLinkRestraintProps,
        createMesh: createCrossLinkRestraintCylinderMesh,
        createLocationIterator: CrossLinkRestraintIterator,
        getLoci: getLinkLoci,
        mark: markLink,
        setUpdateState: (state: VisualUpdateState, newProps: CrossLinkRestraintProps, currentProps: CrossLinkRestraintProps) => {
            state.createGeometry = newProps.radialSegments !== currentProps.radialSegments
        }
    })
}

function CrossLinkRestraintIterator(structure: Structure): LocationIterator {
    const { pairs } = structure.crossLinkRestraints
    const groupCount = pairs.length
    const instanceCount = 1
    const location = Link.Location()
    const getLocation = (groupIndex: number) => {
        const pair = pairs[groupIndex]
        location.aUnit = pair.unitA
        location.aIndex = pair.indexA
        location.bUnit = pair.unitB
        location.bIndex = pair.indexB
        return location
    }
    return LocationIterator(groupCount, instanceCount, getLocation, true)
}

function getLinkLoci(pickingId: PickingId, structure: Structure, id: number) {
    const { objectId, groupId } = pickingId
    if (id === objectId) {
        const pair = structure.crossLinkRestraints.pairs[groupId]
        if (pair) {
            return Link.Loci([ Link.Location(pair.unitA, pair.indexA, pair.unitB, pair.indexB) ])
        }
    }
    return EmptyLoci
}

function markLink(loci: Loci, structure: Structure, apply: (interval: Interval) => boolean) {
    const crossLinks = structure.crossLinkRestraints

    let changed = false
    if (Link.isLoci(loci)) {
        for (const b of loci.links) {
            const indices = crossLinks.getPairIndices(b.aIndex, b.aUnit, b.bIndex, b.bUnit)
            if (indices) {
                for (let i = 0, il = indices.length; i < il; ++i) {
                    if (apply(Interval.ofSingleton(indices[i]))) changed = true
                }
            }
        }
    }
    return changed
}