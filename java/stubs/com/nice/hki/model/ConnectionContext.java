package com.nice.hki.model;

/** Stub of the class in the app (same signatures). */
public class ConnectionContext {
    public ConnectionContext() { }
    public void setAddress(String s) { address = s; }
    public void setMac(String s) { mac = s; }
    public void setPort(int p) { }
    public void setServiceType(String s) { }
    public void setCloudConnection(boolean b) { cloud = b; }
    private boolean cloud;
    private String address, mac;
    private boolean active;
    public boolean isCloudConnection() { return cloud; }
    public boolean isActive() { return active; }
    public String getAddress() { return address; }
    public String getMac() { return mac; }
}
