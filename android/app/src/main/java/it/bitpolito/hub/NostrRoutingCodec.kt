package it.bitpolito.hub

import java.io.ByteArrayOutputStream
import java.net.URI

/** Marmot 0.19 routing-v1: 32-byte routing ID followed by a QUIC-length vector of URL vectors. */
object NostrRoutingCodec {
    const val COMPONENT=0x8004
    fun encode(group:String,urls:List<String>,sandbox:Boolean):ByteArray {
        require(group.matches(Regex("[a-f0-9]{64}"))){"Invalid group routing identifier"}
        val relays=urls.map{it.trim()}.filter{it.isNotEmpty()}.distinct().sorted()
        require(relays.size in 2..16){"Configure between two and sixteen relay endpoints"}
        val entries=ByteArrayOutputStream()
        for(relay in relays){val uri=URI(relay);require((uri.scheme=="wss"||(sandbox&&uri.scheme=="ws"&&uri.host=="127.0.0.1"))&&uri.host!=null&&uri.rawUserInfo==null&&uri.rawFragment==null&&relay.toByteArray().size<=512){"Use secure relay URLs without credentials or fragments"};val bytes=relay.toByteArray(Charsets.UTF_8);length(entries,bytes.size);entries.write(bytes)}
        return ByteArrayOutputStream().also{out->group.chunked(2).forEach{out.write(it.toInt(16))};length(out,entries.size());out.write(entries.toByteArray())}.toByteArray()
    }
    private fun length(out:ByteArrayOutputStream,value:Int){require(value<16384);if(value<64)out.write(value)else{out.write((value shr 8) or 0x40);out.write(value and 0xff)}}
}
