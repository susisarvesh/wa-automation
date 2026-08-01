/**
 * Sanitize phone number for Meta WhatsApp API.
 * Meta requires digits only — no + prefix, no spaces, no dashes.
 * e.g. "+370 63949836" → "37063949836"
 */
export function sanitizePhoneForMeta(phone: string): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '')
}

/**
 * Normalize phone number by removing all non-digit characters.
 * Used for comparing phone numbers in different formats.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '')
}

/**
 * Compare two phone numbers accounting for trunk prefix differences.
 * e.g. "370063949836" (with trunk 0) matches "37063949836" (without trunk 0)
 * by comparing the last 8 digits.
 */
export function phonesMatch(phone1: string, phone2: string): boolean {
  const n1 = normalizePhone(phone1)
  const n2 = normalizePhone(phone2)
  if (n1 === n2) return true
  if (n1.length >= 8 && n2.length >= 8) {
    return n1.slice(-8) === n2.slice(-8)
  }
  return false
}

/**
 * Validate phone number is E.164-like format (7-15 digits starting with non-zero).
 * Accepts with or without + prefix.
 */
export function isValidE164(phone: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(phone)
}

/**
 * Country calling codes longest-first for E.164 → Meta cc + national split.
 * Covers common markets; unknown prefixes fall back to 1–3 digit heuristic.
 */
const CALLING_CODES_LONGEST_FIRST = [
  '971', '968', '966', '965', '964', '963', '962', '961', '960',
  '880', '886', '852', '853', '855', '856', '880',
  '234', '254', '255', '256', '233', '212', '213', '216', '218',
  '351', '352', '353', '354', '355', '356', '357', '358', '359',
  '370', '371', '372', '373', '374', '375', '376', '377', '378', '380', '381', '385', '386', '387', '389',
  '420', '421', '423',
  '501', '502', '503', '504', '505', '506', '507', '509',
  '591', '592', '593', '594', '595', '596', '597', '598',
  '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692',
  '850', '852', '853', '855', '856', '880', '886',
  '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998',
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
  '7', '1',
] as const

export type E164Parts = {
  /** Digits only, with leading + stripped conceptually — full international. */
  e164Digits: string
  /** Country calling code digits (no +), e.g. "91". */
  cc: string
  /** National number digits without leading trunk 0, e.g. "9790985447". */
  nationalNumber: string
}

/**
 * Split an E.164 phone into Meta Phone Numbers API `cc` + `phone_number`.
 */
export function parseE164ToCcAndNational(phone: string): E164Parts | null {
  if (!isValidE164(phone)) return null
  const e164Digits = sanitizePhoneForMeta(phone)
  if (!e164Digits || e164Digits.length < 8) return null

  for (const cc of CALLING_CODES_LONGEST_FIRST) {
    if (!e164Digits.startsWith(cc)) continue
    let national = e164Digits.slice(cc.length)
    if (!national || national.length < 4) continue
    // Drop domestic trunk prefix 0 when present (e.g. UK).
    if (national.startsWith('0') && national.length > 4) {
      national = national.slice(1)
    }
    if (!/^[1-9]\d{3,14}$/.test(national)) continue
    return { e164Digits, cc, nationalNumber: national }
  }

  // Fallback: try 1 / 2 / 3 digit country codes.
  for (const ccLen of [1, 2, 3]) {
    if (e164Digits.length <= ccLen + 4) continue
    const cc = e164Digits.slice(0, ccLen)
    let national = e164Digits.slice(ccLen)
    if (national.startsWith('0') && national.length > 4) {
      national = national.slice(1)
    }
    if (/^[1-9]\d{3,14}$/.test(national)) {
      return { e164Digits, cc, nationalNumber: national }
    }
  }
  return null
}

/**
 * Generate plausible phone number variants for retry when Meta's
 * sandbox rejects a number with error #131030 ("not in allowed list").
 *
 * Many countries use a "trunk prefix" 0 for domestic dialing that is
 * meant to be dropped in international format (e.g. Lithuanian
 * "+370 063 949 836" domestically → "+370 63 949 836" international).
 * But some sandboxes register the number with the trunk 0 included,
 * causing sends to the correct international format to fail.
 *
 * This helper yields up to 3 variants:
 *   1. The original sanitized number (first attempt)
 *   2. With a trunk 0 inserted after the country code
 *   3. With a trunk 0 removed after the country code
 *
 * Country-code lengths of 1, 2, and 3 digits are tried because we
 * don't know the user's country ahead of time.
 *
 * @param sanitized - digits-only phone number (from sanitizePhoneForMeta)
 * @returns deduplicated list of variants, original first
 */
export function phoneVariants(sanitized: string): string[] {
  if (!sanitized) return []
  const seen = new Set<string>()
  const push = (v: string) => {
    if (v && !seen.has(v)) seen.add(v)
  }

  // 1. Original
  push(sanitized)

  // 2. Insert a 0 after each plausible country-code length
  for (const ccLen of [1, 2, 3]) {
    if (sanitized.length <= ccLen) continue
    const cc = sanitized.slice(0, ccLen)
    const rest = sanitized.slice(ccLen)
    if (!rest.startsWith('0')) {
      push(cc + '0' + rest)
    }
  }

  // 3. Remove a leading 0 after each plausible country-code length
  for (const ccLen of [1, 2, 3]) {
    if (sanitized.length <= ccLen + 1) continue
    const cc = sanitized.slice(0, ccLen)
    const rest = sanitized.slice(ccLen)
    if (rest.startsWith('0')) {
      push(cc + rest.slice(1))
    }
  }

  return [...seen]
}

/**
 * Returns true when the Meta API error indicates the recipient
 * phone number isn't in the allowed list (sandbox restriction).
 * Detected via error code 131030 or the standard error text.
 */
export function isRecipientNotAllowedError(message: string): boolean {
  return /131030|not in allowed list|not in the allowed list/i.test(message)
}
