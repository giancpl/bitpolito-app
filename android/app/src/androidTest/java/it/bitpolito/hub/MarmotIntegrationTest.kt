package it.bitpolito.hub

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.ipf.marmotkit.*
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.delay
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

/** Disposable protocol identities only. Never opens the user's runtime root or vault. */
@RunWith(AndroidJUnit4::class)
class MarmotIntegrationTest {
    @Test fun encryptedGroupSurvivesRestartAndTwoRelays() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val root = File(context.filesDir, "protocol-test-${UUID.randomUUID()}")
        val relays = listOf("ws://127.0.0.1:3480", "ws://127.0.0.1:3481")
        val deployment = marmotDeploymentNeutral().apply { keychainService = "it.bitpolito.protocol-test.${UUID.randomUUID()}" }
        val options = MarmotOptions(relayPolicy=RelayPolicyFfi.ALLOW_LOOPBACK, deployment=deployment)
        var kit = Marmot.newWithConfiguration(root.absolutePath, relays, options)
        try {
            kit.start()
            val alice = kit.createIdentity(relays, emptyList(), relays)
            val bob = kit.createIdentity(relays, emptyList(), relays)
            val created = kit.createGroup(alice.accountIdHex, "Protocol test", listOf(bob.accountIdHex), null)
            val group = requireNotNull(created.groupIdHex) { "Group publication failed" }
            var received = false
            repeat(30) {
                if (!received) {
                    try { kit.acceptGroupInvite(bob.accountIdHex, group); received=true } catch (_: Exception) { delay(500) }
                }
            }
            assertTrue("Bob received an authenticated Welcome", received)
            val sent = kit.sendCustomEvent(alice.accountIdHex, group, 78uL, listOf(listOf("t", "bitpolito.hub.v1")), "{\"test\":\"encrypted office operation\"}")
            assertTrue("At least one relay accepted publication", sent.published > 0u)
            var messages = emptyList<AppMessageRecordFfi>()
            repeat(30) {
                if (messages.isEmpty()) { delay(500); messages=kit.messages(bob.accountIdHex,group,100u,listOf(78uL)) }
            }
            assertTrue("Bob decrypted Alice's custom event", messages.any { it.plaintext.contains("encrypted office operation") })
            assertTrue(messages.all { it.sender == alice.accountIdHex || it.sender.contains(alice.accountIdHex) })
            kit.shutdownAndClose()
            kit = Marmot.newWithConfiguration(root.absolutePath,relays,options)
            kit.start()
            assertTrue("Encrypted history survives runtime restart",kit.messages(bob.accountIdHex,group,100u,listOf(78uL)).any{it.plaintext.contains("encrypted office operation")})
        } finally { kit.shutdownAndClose() }
    }
}
