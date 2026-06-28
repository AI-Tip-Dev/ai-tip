/**
 * Form Detection Handlers — proxy to content script's DOM-based detection.
 */

export async function handleDetectFields(
  _args: unknown[], sender: chrome.runtime.MessageSender
): Promise<{ fields: Array<{ label: string; type: string; required: boolean; value: string; name?: string; id?: string; placeholder?: string; rect?: { x: number; y: number; width: number; height: number } }> }> {
  const tabId = sender.tab?.id
  if (!tabId) throw new Error('No tab ID available for form detection')
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'BRIDGE_CALL', id: 'detect-' + Date.now(), method: 'form-detect:scan', args: [] }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else if (response?.success) resolve(response.data)
      else reject(new Error(response?.error || 'Form detection failed'))
    })
  })
}

export async function handleBuildAXTreeText(
  _args: unknown[], sender: chrome.runtime.MessageSender
): Promise<string> {
  const tabId = sender.tab?.id
  if (!tabId) throw new Error('No tab ID available')
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'BRIDGE_CALL', id: 'axtree-' + Date.now(), method: 'form-detect:buildAXTree', args: [] }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else if (response?.success) resolve(response.data as string)
      else reject(new Error(response?.error || 'AX tree build failed'))
    })
  })
}
