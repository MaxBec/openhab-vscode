import {
    commands,
    Uri,
    window,
    workspace,
    Hover,
    MarkdownString
} from 'vscode'

import {PreviewPanel} from './WebView/PreviewPanel'

import * as _ from 'lodash'
import * as request from 'request-promise-native'
import { OutputChannel } from 'vscode'

//Create output channel
let extensionOutput: OutputChannel = null

/**
 * humanize function adapter from the previously included underscore.string library
 */
export function humanize(str: string) : string {
    return _.upperFirst(
        // original 'underscored' of underscore.string
        str.trim()
        .replace(/([a-z\d])([A-Z]+)/g, '$1_$2')
        .replace(/[-\s]+/g, '_')
        .toLowerCase()
        .replace(/([a-z\d])([A-Z]+)/g, '$1_$2')
        .replace(/_id$/, '')
        .replace(/_/g, ' ')
        // original 'humanize' of underscore.string
        .replace(/_id$/, '')
        .replace(/_/g, ' ')
        .trim()
    );
}

export function getHost() {
    let config = workspace.getConfiguration('openhab')
    let host = config.host
    let port = config.port
    let username = config.username
    let password = config.password

    let protocol = 'http'

    if (host.includes('://')) {
        let split = host.split('://')
        host = split[1]
        protocol = split[0]
    }

    let authentication = (username || '') + (password ? ':' + password : '')
    authentication += authentication ? '@' : ''

    return protocol + '://' + authentication + host + (port === 80 ? '' : ':' + port)
}

export function getBuildVersion(): Thenable<string> {
    return new Promise((resolve, reject) => {
        request(getHost() + '/rest/')
            .then((response) => {
                resolve(JSON.parse(response).version)
            }).catch(() => reject())
    })
}

/**
 * Checks hovered editor area for existing openHAB Items and provides some live data from rest api if aan item name is found.
 * 
 * @param hoveredText The currently hovered text part
 * @returns A thenable [Hover](Hover) object with live information or null if no item is found
 */
export function getRestHover(hoveredText) : Thenable<Hover>|null {
    return new Promise((resolve, reject) => {

        console.log(`Requesting => ${getHost()}/rest/items/${hoveredText} <= now`)

        request(`${getHost()}/rest/items/${hoveredText}`)
            .then((response) => {

                let result = JSON.parse(response)
        
                if(!result.error) {

                    let resultText = new MarkdownString()

                    if(result.type === "Group"){

                        resultText.appendCodeblock(`Item ${result.name} | ${result.state}`, 'openhab');
                        resultText.appendMarkdown(`##### Members:`)

                        result.members.forEach( (member, key, result) => {

                            resultText.appendCodeblock(`Item ${member.name} | ${member.state}`, 'openhab')

                            // No newline after the last member information
                            if(!Object.is(result.length - 1, key)){
                                resultText.appendText(`\n`)
                            }

                        });

                    }
                    else{

                        resultText.appendCodeblock(`${result.state}`, 'openhab');
                        
                    }

                    resolve(new Hover(resultText))

                }
                else {

                    console.log(`That's no openHAB item. Waiting for the next hover.`)
                    resolve(null)

                }
            })
            .catch(() => reject(false))
    }) 
}

export function getSimpleModeState(): Thenable<Boolean> {
    return new Promise((resolve, reject) => {
        request(getHost() + '/rest/services/org.eclipse.smarthome.links/config')
            .then((response) => {
                let responseJson = JSON.parse(response);
                resolve(responseJson.autoLinks)
            }).catch(() => reject([]))
    })
}

export function getSitemaps(): Thenable<any[]> {
    return new Promise((resolve, reject) => {
        request(getHost() + '/rest/sitemaps')
            .then((response) => {
                resolve(JSON.parse(response))
            }).catch(() => reject([]))
    })
}

export function hasExtension(name: string): Thenable<boolean> {
    return new Promise((resolve, reject) => {
        request(getHost() + '/rest/extensions')
            .then((response) => {
                let resp = JSON.parse(response)
                let extension = resp.filter((addon) => addon.id === name)
                resolve(extension[0].installed)
            }).catch(() => reject(false))
    })
}

export function openBrowser(url) {
    let editor = window.activeTextEditor
    if (!editor) {
        window.showInformationMessage('No editor is active')
        return
    }

    let selection = editor.selection
    let text = editor.document.getText(selection)
    url = url.startsWith('http') ? url : getHost() + url
    url = url.replace('%s', text.replace(' ', '%20'))
    return commands.executeCommand('vscode.open', Uri.parse(url))
}

export function openUI(extensionPath: string, query: string = "/basicui/app", title?: string) {
    let srcPath: string = getHost().concat(query);
    appendToOutput(`URL that will be opened is: ${srcPath}`)

    PreviewPanel.createOrShow(
        extensionPath,
        (title !== undefined) ? title : undefined,
        srcPath 
    );
}

export async function handleRequestError(err) {
    let config = workspace.getConfiguration('openhab')
    const setHost = 'Set openHAB host'
    const disableRest = 'Disable REST API'
    const message = typeof err.error === 'string' ? err.error : err.error.message
    const result = await window.showErrorMessage(`Error while connecting to openHAB REST API. ${message || ''}`, setHost, disableRest)
    switch (result) {
        case setHost:
            commands.executeCommand('workbench.action.openWorkspaceSettings')
            break
        case disableRest:
            config.update('useRestApi', false)
            break
        default:
            break
    }
}

/**
 * This will send a message frmo the extension to its output channel.
 * If the channel isn't existing already, it will be created during method run.
 * 
 * @param message The message to append to the extensions output Channel
 */
export function appendToOutput(message: string){
    
    if(!extensionOutput) { extensionOutput = window.createOutputChannel("openHAB Extension") }

    extensionOutput.appendLine(message)
}