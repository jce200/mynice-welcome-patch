package com.nice.patch;

import org.json.JSONArray;
import org.json.JSONObject;

/** Pure-logic tests for Nx (runs on a plain JVM; Android calls are caught). */
public class NxTest {
    static int failures = 0;

    static void is(String name, Object expected, Object actual) {
        boolean ok = (expected == null) ? actual == null : expected.equals(actual);
        System.out.println((ok ? "ok    " : "FAIL  ") + name + (ok ? "" : "  expected=" + expected + " actual=" + actual));
        if (!ok) failures++;
    }

    public static void main(String[] a) throws Exception {
        // SSID helpers
        is("unquote with quotes", "NiceIT4WIFIAABBCC", Nx.unquote("\"NiceIT4WIFIAABBCC\""));
        is("unquote without quotes", "HomeWifi", Nx.unquote("HomeWifi"));
        is("unquote null", "", Nx.unquote(null));
        is("unquote lone quote character", "\"", Nx.unquote("\""));
        is("accessory SSID IT4WIFI", true, Nx.isModuleSsid("NiceIT4WIFIAABBCC"));
        is("accessory SSID CORE", true, Nx.isModuleSsid("NiceCORE1234"));
        is("accessory SSID Bridge", true, Nx.isModuleSsid("NiceBridgeAB"));
        is("home network HomeWifi is NOT an accessory", false, Nx.isModuleSsid("HomeWifi"));
        is("home network starts with Nice but is not an accessory", false, Nx.isModuleSsid("NiceHome"));
        is("null is not an accessory", false, Nx.isModuleSsid(null));

        // network key changes on every switch
        String k0 = Nx.networkKey("HomeWifi");
        Nx.generation++;
        String k1 = Nx.networkKey("HomeWifi");
        is("key changes after generation increment", true, !k0.equals(k1));
        is("key with null SSID", true, Nx.networkKey(null).startsWith("#nx"));

        // hints
        JSONArray h = new JSONArray();
        h.put(new JSONObject().put("mac", "00:0b:6c:aa:bb:cc").put("address", "192.168.1.72"));
        h.put(new JSONObject().put("mac", "AA:BB").put("address", "no-ip"));       // invalid address
        h.put(new JSONObject().put("mac", "").put("address", "192.168.1.9"));        // empty MAC
        h.put(new JSONObject().put("mac", "CC:DD").put("address", "999.1.1.1"));     // out of range
        h.put("garbage");
        Nx.setHints(h);
        is("hint found (upper case)", true, Nx.hintContext("00:0B:6C:AA:BB:CC") != null);
        is("hint found (lower case)", true, Nx.hintContext("00:0b:6c:aa:bb:cc") != null);
        is("hint with invalid address ignored", null, Nx.hintContext("AA:BB"));
        is("hint out of range ignored", null, Nx.hintContext("CC:DD"));
        is("hint unknown", null, Nx.hintContext("11:22"));
        is("hint null", null, Nx.hintContext(null));
        Nx.setHints(null);
        is("hints cleared", null, Nx.hintContext("00:0B:6C:AA:BB:CC"));

        // without accessory connection
        is("localIp without accessory connection", null, Nx.localIp());
        is("moduleSocket without accessory connection", null, Nx.moduleSocket());
        is("handleSsid without accessory connection", false, Nx.handleSsid(null));

        // error path: handleConnect with garbage must never throw an exception
        is("handleConnect(null...) falls back to false", false, Nx.handleConnect(null, null, null, null));

        // nx4: a VPN over Wi-Fi reports TRANSPORT_WIFI too and is therefore NOT Wi-Fi
        is("realWifi: Wi-Fi without VPN", true, Nx.realWifi(true, false));
        is("realWifi: VPN over Wi-Fi is not Wi-Fi", false, Nx.realWifi(true, true));
        is("realWifi: VPN over mobile", false, Nx.realWifi(false, true));
        is("realWifi: mobile only", false, Nx.realWifi(false, false));

        // nx4: the hook in the Wi-Fi receiver. Without a context (no plugin call yet) the type stays as it was.
        is("wifiType: Wi-Fi stays Wi-Fi", 1, Nx.wifiType(1));
        is("wifiType: VPN (17) without context stays 17", 17, Nx.wifiType(17));
        is("wifiType: mobile (0) without context stays 0", 0, Nx.wifiType(0));
        Nx.ctx(null);   // must not throw
        is("ctx(null) leaves appCtx empty", null, Nx.appCtx);

        // nx4: routes to the accessory
        is("routeLabel with interface", "192.168.1.0/24 via tun0", Nx.routeLabel("192.168.1.0/24", "tun0"));
        is("routeLabel without interface", "0.0.0.0/0", Nx.routeLabel("0.0.0.0/0", ""));
        is("routeLabel without destination and interface", "?", Nx.routeLabel(null, null));
        is("vpnRouteFor: invalid address", null, Nx.vpnRouteFor(null, new java.util.ArrayList<android.net.Network>(), "no-ip"));
        is("vpnRouteFor: no VPN networks", null, Nx.vpnRouteFor(null, new java.util.ArrayList<android.net.Network>(), "192.168.1.72"));
        is("version", "nx-19", Nx.PATCH_VERSION);

        // nx5: does the stored address fit the network? (only the pure calculation rule; the Android calls run on a phone)
        byte[] phone = { (byte) 192, (byte) 168, 1, 50 };
        byte[] module = { (byte) 192, (byte) 168, 1, 72 };
        byte[] foreign = { (byte) 192, (byte) 168, 2, 72 };
        byte[] farNet = { 10, 0, 0, 5 };
        is("subnet: same /24", true, Nx.sameSubnet(phone, 24, module));
        is("subnet: different /24", false, Nx.sameSubnet(phone, 24, foreign));
        is("subnet: different /24 but together in a /16", true, Nx.sameSubnet(phone, 16, foreign));
        is("subnet: entirely different network", false, Nx.sameSubnet(phone, 24, farNet));
        is("subnet: /20 boundary (192.168.1.x and 192.168.15.x)", true, Nx.sameSubnet(phone, 20, new byte[] { (byte) 192, (byte) 168, 15, 1 }));
        is("subnet: /20 boundary (192.168.16.x falls outside)", false, Nx.sameSubnet(phone, 20, new byte[] { (byte) 192, (byte) 168, 16, 1 }));
        is("subnet: /32 only the same address", true, Nx.sameSubnet(phone, 32, phone.clone()));
        is("subnet: /32 different address", false, Nx.sameSubnet(phone, 32, module));
        is("subnet: /0 is everything", true, Nx.sameSubnet(phone, 0, farNet));
        is("subnet: invalid length", false, Nx.sameSubnet(phone, 33, module));
        is("subnet: negative length", false, Nx.sameSubnet(phone, -1, module));
        is("subnet: IPv4 against IPv6", false, Nx.sameSubnet(phone, 24, new byte[16]));
        is("subnet: null", false, Nx.sameSubnet(null, 24, module));
        // without a context (no plugin call yet) the behavior of nx3/nx4 stays: allow
        is("hintAllowed without context allows", true, Nx.hintAllowed("192.168.1.72"));
        is("hintAllowed with garbage input allows (fail-open)", true, Nx.hintAllowed("no-ip"));

        // nx6: a DNS filter answers a blocked name with 0.0.0.0 or ::; that is not a usable address
        is("usable: 0.0.0.0 is rejected", false, Nx.usable(java.net.InetAddress.getByAddress(new byte[4])));
        is("usable: :: is rejected", false, Nx.usable(java.net.InetAddress.getByAddress(new byte[16])));
        is("usable: loopback is rejected", false, Nx.usable(java.net.InetAddress.getByAddress(new byte[] { 127, 0, 0, 1 })));
        is("usable: ordinary address is accepted", true, Nx.usable(java.net.InetAddress.getByAddress(new byte[] { 34, 1, 2, 3 })));
        is("usable: null is rejected", false, Nx.usable(null));
        // a literal address is not looked up again and comes back unchanged
        java.net.InetSocketAddress sa = Nx.socketAddress("192.168.1.72", 443);
        is("socketAddress: literal address stays the same", "192.168.1.72:443", sa.getAddress().getHostAddress() + ":" + sa.getPort());

        // vetLocal: a working session, the cloud and everything that cannot be judged are left alone
        com.nice.hki.model.ConnectionContext cloud = new com.nice.hki.model.ConnectionContext();
        cloud.setCloudConnection(true);
        cloud.setAddress("it4wifi.cloud.nice.niceappdomain.com");
        is("vetLocal: null stays null", null, Nx.vetLocal(null));
        is("vetLocal: the cloud is left alone", cloud, Nx.vetLocal(cloud));
        com.nice.hki.model.ConnectionContext withoutAddress = new com.nice.hki.model.ConnectionContext();
        is("vetLocal: without address left alone", withoutAddress, Nx.vetLocal(withoutAddress));
        com.nice.hki.model.ConnectionContext name = new com.nice.hki.model.ConnectionContext();
        name.setAddress("module.local");
        is("vetLocal: a name (not IPv4) left alone", name, Nx.vetLocal(name));
        com.nice.hki.model.ConnectionContext local = new com.nice.hki.model.ConnectionContext();
        local.setAddress("192.168.1.72");
        is("vetLocal: without context (cannot be judged) the address stays", local, Nx.vetLocal(local));
        // nx7: if Android refuses to bind to a network (VPN, EPERM), a plain socket comes out and no error
        boolean[] bound = { true };
        java.net.Socket unbound = Nx.socketFor(null, bound);
        is("socketFor without network gives a plain socket", true, unbound != null && !unbound.isConnected());
        is("socketFor reports that it is not bound", false, bound[0]);
        java.net.Socket via2 = null;
        try {
            // with a real Network object the binding fails here too (no Android runtime): that too must give a plain socket
            via2 = Nx.socketFor(new android.net.Network(376));
        } catch (Throwable ex) {
            System.out.println("note: Network object cannot be created on this JVM (" + ex + ")");
            via2 = new java.net.Socket();
        }
        is("socketFor with a Network without Android runtime gives a plain socket", true, via2 != null);
        is("vpnActive without context is false", false, Nx.vpnActive());
        Nx.noteRoute(null);
        Nx.noteRoute(cloud);
        Nx.noteRoute(local);
        is("noteRoute throws nothing", true, true);

        // nx8: local and cloud take turns when one fails
        is("preference: not active at the start", false, Nx.cloudPreferenceActive());
        Nx.noteRoute(local);
        Nx.checkFailed();
        is("preference: after a failed local attempt the cloud takes priority", true, Nx.cloudPreferenceActive());
        long rest1 = Nx.cloudPreferenceRemaining();
        is("preference: first time about 2 minutes", true, rest1 > 100 && rest1 <= 120);
        is("preference: the stored address is then no longer allowed", false, Nx.hintAllowed("192.168.1.72"));
        is("preference: a local context (without session) is then skipped", null, Nx.vetLocal(local));
        is("preference: the cloud itself always remains possible", cloud, Nx.vetLocal(cloud));
        Nx.checkFailed();
        long rest2 = Nx.cloudPreferenceRemaining();
        is("preference: second local failure doubles it (about 4 minutes)", true, rest2 > 220 && rest2 <= 240);
        Nx.noteRoute(cloud);
        Nx.checkSucceeded();
        is("preference: a successful check via the cloud does not clear the preference", true, Nx.cloudPreferenceActive());
        Nx.checkFailed();
        is("preference: if the cloud fails too, local is allowed again", false, Nx.cloudPreferenceActive());
        is("preference: the address is then allowed again", true, Nx.hintAllowed("192.168.1.72"));
        Nx.noteRoute(local);
        Nx.checkFailed();
        Nx.checkSucceeded();
        is("preference: a successful local check clears the preference", false, Nx.cloudPreferenceActive());
        for (int i = 0; i < 8; i++) Nx.checkFailed();
        long rest3 = Nx.cloudPreferenceRemaining();
        is("preference: never longer than 15 minutes", true, rest3 > 800 && rest3 <= 900);
        Nx.checkSucceeded();
        is("preference: cleaned up at the end of the test", false, Nx.cloudPreferenceActive());

        System.out.println(failures == 0 ? "ALL OK" : (failures + " FAILED"));
        System.exit(failures == 0 ? 0 : 1);
    }
}
