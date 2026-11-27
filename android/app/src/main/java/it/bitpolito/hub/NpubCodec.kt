package it.bitpolito.hub

/**
 * Decodes Nostr `npub1…` Bech32 public keys (or 64-char hex public keys) to lowercase hex.
 */
internal object NpubCodec {
    private const val CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    private val HEX = Regex("[a-f0-9]{64}")

    fun decodePubkey(raw: String): String? {
        val value = raw.trim().lowercase()
        if (value.isEmpty()) return null
        if (HEX.matches(value)) return value
        if (!value.startsWith("npub1")) return null
        val sep = value.lastIndexOf('1')
        if (sep != 4 || value.length < sep + 7) return null
        val hrp = value.substring(0, sep)
        val dataPart = value.substring(sep + 1)
        val values = IntArray(dataPart.length)
        for (i in dataPart.indices) {
            val idx = CHARSET.indexOf(dataPart[i])
            if (idx < 0) return null
            values[i] = idx
        }
        if (!verifyChecksum(hrp, values)) return null
        val payload = values.copyOfRange(0, values.size - 6)
        val bytes = convert5to8(payload) ?: return null
        if (bytes.size != 32) return null
        return bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }

    fun parseList(raw: String): Set<String> =
        raw.split(Regex("[\\s,;]+"))
            .mapNotNull { decodePubkey(it) }
            .toSet()

    private fun polymod(values: IntArray): Int {
        val gen = intArrayOf(0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3)
        var chk = 1
        for (v in values) {
            val b = chk ushr 25
            chk = ((chk and 0x1ffffff) shl 5) xor v
            for (i in 0 until 5) {
                if (((b ushr i) and 1) != 0) chk = chk xor gen[i]
            }
        }
        return chk
    }

    private fun hrpExpand(hrp: String): IntArray {
        val out = IntArray(hrp.length * 2 + 1)
        for (i in hrp.indices) {
            out[i] = hrp[i].code ushr 5
            out[i + hrp.length + 1] = hrp[i].code and 31
        }
        return out
    }

    private fun verifyChecksum(hrp: String, data: IntArray): Boolean {
        val expanded = hrpExpand(hrp)
        val combined = IntArray(expanded.size + data.size)
        expanded.copyInto(combined)
        data.copyInto(combined, expanded.size)
        return polymod(combined) == 1
    }

    private fun convert5to8(data: IntArray): ByteArray? {
        var acc = 0
        var bits = 0
        val out = ArrayList<Byte>(data.size * 5 / 8)
        for (v in data) {
            if (v < 0 || v > 31) return null
            acc = (acc shl 5) or v
            bits += 5
            while (bits >= 8) {
                bits -= 8
                out.add(((acc ushr bits) and 0xff).toByte())
            }
        }
        if (bits >= 5 || ((acc shl (8 - bits)) and 0xff) != 0) return null
        return out.toByteArray()
    }
}
