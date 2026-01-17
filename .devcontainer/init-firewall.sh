#!/bin/bash
set -e

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
iptables -P INPUT ACCEPT
iptables -P FORWARD ACCEPT
iptables -P OUTPUT ACCEPT

# Create a new chain for outbound filtering
iptables -N OUTBOUND_FILTER

# Allow established connections
iptables -A OUTBOUND_FILTER -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow loopback
iptables -A OUTBOUND_FILTER -o lo -j ACCEPT

# Allow DNS (UDP/TCP 53)
iptables -A OUTBOUND_FILTER -p udp --dport 53 -j ACCEPT
iptables -A OUTBOUND_FILTER -p tcp --dport 53 -j ACCEPT

# Allow HTTP/HTTPS
iptables -A OUTBOUND_FILTER -p tcp --dport 80 -j ACCEPT
iptables -A OUTBOUND_FILTER -p tcp --dport 443 -j ACCEPT

# Reject all other outbound traffic
iptables -A OUTBOUND_FILTER -j REJECT

# Apply the chain to OUTPUT
iptables -A OUTPUT -j OUTBOUND_FILTER

echo "Firewall initialized: DNS, HTTP, HTTPS allowed; all other outbound blocked."
