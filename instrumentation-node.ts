import dns from "node:dns";
import net from "node:net";

// Calls to the Traccar server: on links without a working IPv6 route and with a slow IPv4 handshake (measured 0.5–1.4 s),
// Node's default of 250 ms per address made new connections fail with ETIMEDOUT, so polls returned 502 and the map went stale.
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamilyAttemptTimeout(3000);
