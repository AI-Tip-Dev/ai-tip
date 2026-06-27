/**
 * Version compatibility utilities.
 *
 * Ensures the SDK and host environment versions are compatible.
 */

import { BridgeVersionError } from '../types'

/**
 * Parse a semver string into major.minor.patch components.
 * Returns null for invalid versions.
 */
export function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  // Strip leading 'v' if present
  const cleaned = version.replace(/^v/, '')
  const parts = cleaned.split('.')
  if (parts.length < 2 || parts.length > 3) return null

  const major = parseInt(parts[0], 10)
  const minor = parseInt(parts[1], 10)
  const patch = parts.length === 3 ? parseInt(parts[2], 10) : 0

  if (isNaN(major) || isNaN(minor) || isNaN(patch)) return null

  return { major, minor, patch }
}

/**
 * Check if two semver versions are compatible.
 *
 * Compatibility rules:
 * - Same major version → compatible
 * - SDK major < host major → incompatible (SDK too old for host)
 * - SDK major > host major → incompatible (SDK too new for host)
 */
export function areVersionsCompatible(sdkVersion: string, hostVersion: string): boolean {
  const sdk = parseSemver(sdkVersion)
  const host = parseSemver(hostVersion)

  if (!sdk || !host) {
    // If we can't parse versions, assume compatible (fail open with a warning)
    console.warn(`[ai-tip/sdk] Cannot parse versions: sdk=${sdkVersion} host=${hostVersion}`)
    return true
  }

  return sdk.major === host.major
}

/**
 * Check version compatibility and throw if incompatible.
 */
export function validateVersions(sdkVersion: string, hostVersion: string): void {
  if (!areVersionsCompatible(sdkVersion, hostVersion)) {
    throw new BridgeVersionError(hostVersion, sdkVersion)
  }
}

/** SDK version, read from package.json at build time */
// In a real build, this would be replaced by a build tool.
// For now, it's hardcoded.
export const SDK_VERSION = '0.1.0'
