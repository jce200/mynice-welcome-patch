#!/usr/bin/env python3
"""Patch nx26 (diagnostic events): the events of the accessory that the app does not read are written to the Debug log.

Usage: python patch-22-diagnostic.py <apktool-output-dir>   (all or nothing; idempotent)

The accessory sends events of the type CHANGE (the state of the gate) and, as the current MyNice app of Nice shows, of the type DIAGNOSTIC: why a manoeuvre
ended (a cause code), the state of the photocells (Bluebus), the number of manoeuvres and the threshold for maintenance, the average motor current. The app
that this kit patches knows six event types and throws every other one away ("Event type unknown!"). This patch changes nothing in what the app does with an
event; it only passes the text of every event to Nx.noteEvent (java/src/com/nice/patch/Nx.java) before the app parses it, and that writes to the Debug log:
  - an event of a type that the app does not know (DIAGNOSTIC and whatever else there is), and
  - an event of a known type that carries details the app does not read (EventDetails),
with the names, addresses and the signature in it replaced by dots. It is the first step: to see what a given gate controller really sends.

  smali/com/nice/hki/protocol/MessageParser.smali: one call at the start of the branch for "<Event"
"""
import os
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
path = None
for d in sorted(os.listdir(sys.argv[1])):
    p = os.path.join(sys.argv[1], d, "com", "nice", "hki", "protocol", "MessageParser.smali")
    if d.startswith("smali") and os.path.isfile(p):
        path = p
if not path:
    sys.exit("not found: com/nice/hki/protocol/MessageParser.smali")
text = open(path, encoding="utf-8", newline="").read()
CALL = "    invoke-static {p1}, Lcom/nice/patch/Nx;->noteEvent(Ljava/lang/String;)V\n\n"
if "Lcom/nice/patch/Nx;->noteEvent" in text:
    sys.exit("already patched (nx26 diagnostic events)")
ANCHOR = ("    iget-object v0, p0, Lcom/nice/hki/protocol/MessageParser;->eventParser:Lcom/nice/hki/protocol/events/EventParser;\n")
if text.count(ANCHOR) != 1:
    sys.exit("MessageParser.smali: expected 1 use of eventParser in parse(), found %d" % text.count(ANCHOR))
if "invoke-virtual {v0, p1}, Lcom/nice/hki/protocol/events/EventParser;->parse(Ljava/lang/String;)" not in text:
    sys.exit("MessageParser.smali: the text of the event is not in p1 where it is parsed")
open(path, "w", encoding="utf-8", newline="").write(text.replace(ANCHOR, CALL + ANCHOR))
print("patched (nx26 diagnostic events): " + os.path.relpath(path, sys.argv[1]))
