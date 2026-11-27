package it.bitpolito.hub

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NpubCodecTest {
    @Test
    fun decodesStandardNpubAndHex() {
        // NIP-19 official test vector
        val npub = "npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg"
        val hex = "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e"
        assertEquals(hex, NpubCodec.decodePubkey(npub))
        assertEquals(hex, NpubCodec.decodePubkey(hex.uppercase()))
        assertEquals(setOf(hex), NpubCodec.parseList(" $npub , invalid "))
        assertEquals(setOf(hex, "a".repeat(64)), NpubCodec.parseList("$npub\n${"a".repeat(64)}\t$npub"))
    }

    @Test
    fun rejectsMalformedOrWrongPrefixKeys() {
        assertNull(NpubCodec.decodePubkey(""))
        assertNull(NpubCodec.decodePubkey("npub1invalid"))
        assertNull(NpubCodec.decodePubkey("nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5"))
    }
}
