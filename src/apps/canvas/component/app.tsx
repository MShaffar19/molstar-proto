/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import * as React from 'react'
import { StructureView } from '../structure-view';
import { App } from '../app';
import { Viewport } from './viewport';
import { StructureViewComponent } from './structure-view';
import { Examples } from '../examples';

export interface AppProps {
    app: App
}

export interface AppState {
    structureView: StructureView | null,
    binary: boolean
}

export class AppComponent extends React.Component<AppProps, AppState> {
    state = {
        structureView: this.props.app.structureView,
        binary: false
    }

    componentDidMount() {
        this.props.app.pdbIdLoaded.subscribe((structureView) => {
            this.setState({
                structureView: this.props.app.structureView
            })
        })
    }

    render() {
        const { structureView } = this.state

        return <div style={{width: '100%', height: '100%'}}>
            <div style={{left: '0px', right: '350px', height: '100%', position: 'absolute'}}>
                <Viewport app={this.props.app} />
            </div>

            <div style={{width: '330px', paddingLeft: '10px', paddingRight: '10px', right: '0px', height: '100%', position: 'absolute', overflow: 'auto'}}>
                <div style={{marginTop: '10px'}}>
                    <span>Load PDB ID or URL</span>&nbsp;&nbsp;
                    <input type='checkbox' checked={this.state.binary} onChange={e => this.setState({ binary: e.target.checked })} /> Binary<br />
                    <input
                        style={{ width: '100%' }}
                        type='text'
                        onKeyDown={e => {
                            if (e.keyCode === 13) {
                                const value = e.currentTarget.value.trim()
                                if (value) {
                                    this.props.app.loadPdbIdOrUrl(value, { binary: this.state.binary })
                                }
                            }
                        }}
                    />
                </div>
                <div>
                    <span>Load CIF file </span>
                    <input
                        accept='*.cif'
                        type='file'
                        onChange={e => {
                            if (e.target.files) this.props.app.loadCifFile(e.target.files[0])
                        }}
                    />
                </div>
                <div>
                    <span>Load example </span>
                    <select
                        style={{width: '200px'}}
                        onChange={e => {
                            this.props.app.loadPdbIdOrUrl(e.target.value)
                        }}
                    >
                        <option value=''></option>
                        {Examples.map(({label, id, description}, i) => {
                            return <option key={i} value={id}>{`${label ? label : id} - ${description}`}</option>
                        })}
                    </select>
                </div>
                <hr/>
                <div style={{marginBottom: '10px'}}>
                    {structureView ? <StructureViewComponent structureView={structureView} /> : ''}
                </div>
            </div>
        </div>;
    }
}