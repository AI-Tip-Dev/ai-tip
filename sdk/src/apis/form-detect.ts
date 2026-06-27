/**
 * Form Detection API — CDP-based form field detection + AX tree text generation.
 *
 * Usage:
 *   const { fields, rawNodes } = await bridge.formDetect.detectFields(webContentsId)
 *   const axText = await bridge.formDetect.buildAXTreeText(rawNodes)
 */

import type { Transport, FormDetectAPI, DetectFieldsResult, RawAXNode } from '../types'

export function createFormDetectAPI(transport: Transport): FormDetectAPI {
  return {
    async detectFields(webContentsId: number): Promise<DetectFieldsResult> {
      return transport.invoke('form-detect:detectFields', [webContentsId]) as Promise<DetectFieldsResult>
    },

    async buildAXTreeText(rawNodes: RawAXNode[]): Promise<string> {
      return transport.invoke('form-detect:buildAXTreeText', [rawNodes]) as Promise<string>
    },
  }
}
