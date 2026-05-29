#!/bin/bash
# =============================================================================
# setup-https-alb.sh
# Provision ACM TLS certificate for mediczy.in, attach to ALB, redirect HTTP→HTTPS
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Variables — update if infrastructure changes
# ---------------------------------------------------------------------------
DOMAIN="mediczy.in"
WILDCARD_DOMAIN="*.mediczy.in"
ALB_ARN=""                  # Resolved below via describe-load-balancers
ALB_DNS="mediczy-alb-1379230293.ap-south-1.elb.amazonaws.com"
REGION="ap-south-1"
HEALTH_URL="https://mediczy.in/api/health"
ACM_WAIT_SECONDS=300        # 5 minutes max

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
info() { echo -e "\n\033[1;34m>>> $*\033[0m"; }
ok()   { echo -e "\033[1;32m✔  $*\033[0m"; }
warn() { echo -e "\033[1;33m⚠  $*\033[0m"; }
die()  { echo -e "\033[1;31m✖  $*\033[0m"; exit 1; }

# ---------------------------------------------------------------------------
# 0. Pre-flight: confirm AWS CLI available and caller identity
# ---------------------------------------------------------------------------
info "Pre-flight checks"
aws --version >/dev/null 2>&1 || die "AWS CLI v2 not found"
CALLER=$(aws sts get-caller-identity --query 'Arn' --output text --region "$REGION")
log "Running as: $CALLER"
log "Target domain: $DOMAIN  |  Region: $REGION"

# ---------------------------------------------------------------------------
# 1. Request ACM certificate (DNS validation)
# ---------------------------------------------------------------------------
info "Step 1 — Requesting ACM certificate for $DOMAIN and $WILDCARD_DOMAIN"

# Check if a certificate already exists for this domain to avoid duplicates
EXISTING_CERT=$(aws acm list-certificates \
  --region "$REGION" \
  --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" \
  --output text 2>/dev/null || true)

if [[ "$EXISTING_CERT" != "None" && -n "$EXISTING_CERT" ]]; then
  warn "Certificate already exists: $EXISTING_CERT"
  CERT_ARN="$EXISTING_CERT"
else
  CERT_ARN=$(aws acm request-certificate \
    --domain-name "$DOMAIN" \
    --subject-alternative-names "$WILDCARD_DOMAIN" \
    --validation-method DNS \
    --idempotency-token "mediczy-$(date +%Y%m%d)" \
    --region "$REGION" \
    --query 'CertificateArn' \
    --output text)
  log "Certificate requested: $CERT_ARN"
fi

# ---------------------------------------------------------------------------
# 2. Print CNAME records for Cloudflare DNS validation
# ---------------------------------------------------------------------------
info "Step 2 — Retrieving DNS validation CNAME records"

# ACM may take a few seconds to populate validation options
log "Waiting 15s for ACM to generate validation records..."
sleep 15

DNS_RECORDS=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$REGION" \
  --query 'Certificate.DomainValidationOptions[*].ResourceRecord' \
  --output json)

echo ""
echo "============================================================"
echo "  ADD THESE CNAME RECORDS IN CLOUDFLARE DNS:"
echo "============================================================"
echo "$DNS_RECORDS" | python3 -c "
import json, sys
records = json.load(sys.stdin)
seen = set()
for r in records:
    if r and 'Name' in r and r['Name'] not in seen:
        seen.add(r['Name'])
        print(f\"  Type: CNAME\")
        print(f\"  Name: {r['Name'].rstrip('.')}\")
        print(f\"  Value: {r['Value'].rstrip('.')}\")
        print(f\"  TTL: 300 (Auto in Cloudflare)\")
        print()
" 2>/dev/null || echo "$DNS_RECORDS"
echo "============================================================"
echo ""
echo "NOTE: Set Cloudflare proxy status to DNS-only (grey cloud)"
echo "      for these CNAME records during validation."
echo ""

# ---------------------------------------------------------------------------
# 3. Wait for ACM certificate to reach ISSUED status
# ---------------------------------------------------------------------------
info "Step 3 — Waiting for ACM certificate to be ISSUED (max ${ACM_WAIT_SECONDS}s)"
warn "Make sure you have added the CNAME records above in Cloudflare before this times out."

ELAPSED=0
INTERVAL=20
while true; do
  STATUS=$(aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region "$REGION" \
    --query 'Certificate.Status' \
    --output text)

  log "Certificate status: $STATUS  (${ELAPSED}s elapsed)"

  if [[ "$STATUS" == "ISSUED" ]]; then
    ok "Certificate is ISSUED: $CERT_ARN"
    break
  elif [[ "$STATUS" == "FAILED" ]]; then
    die "Certificate validation FAILED. Check CNAME records in Cloudflare."
  fi

  if (( ELAPSED >= ACM_WAIT_SECONDS )); then
    warn "Timeout waiting for certificate. Current status: $STATUS"
    warn "Re-run this script after adding CNAME records in Cloudflare."
    warn "Certificate ARN for later use: $CERT_ARN"
    exit 1
  fi

  sleep "$INTERVAL"
  ELAPSED=$(( ELAPSED + INTERVAL ))
done

# ---------------------------------------------------------------------------
# 4. Look up ALB ARN and existing listeners
# ---------------------------------------------------------------------------
info "Step 4 — Looking up ALB details"

ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names "mediczy-alb" \
  --region "$REGION" \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text 2>/dev/null) || true

# Fallback: search by DNS name if --names fails (ALB name may differ)
if [[ -z "$ALB_ARN" || "$ALB_ARN" == "None" ]]; then
  ALB_ARN=$(aws elbv2 describe-load-balancers \
    --region "$REGION" \
    --query "LoadBalancers[?DNSName=='$ALB_DNS'].LoadBalancerArn | [0]" \
    --output text)
fi

[[ -z "$ALB_ARN" || "$ALB_ARN" == "None" ]] && die "Could not find ALB with DNS $ALB_DNS"
log "ALB ARN: $ALB_ARN"

# Get existing listeners
HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --region "$REGION" \
  --query 'Listeners[?Port==`80`].ListenerArn | [0]' \
  --output text)

HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --region "$REGION" \
  --query 'Listeners[?Port==`443`].ListenerArn | [0]' \
  --output text)

# Get default target group from HTTP listener (to reuse for HTTPS)
DEFAULT_TG_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --region "$REGION" \
  --query 'Listeners[?Port==`80`].DefaultActions[0].TargetGroupArn | [0]' \
  --output text)

log "HTTP listener: $HTTP_LISTENER_ARN"
log "HTTPS listener (existing): $HTTPS_LISTENER_ARN"
log "Default target group: $DEFAULT_TG_ARN"

# ---------------------------------------------------------------------------
# 5. Add HTTPS:443 listener (or update if already exists)
# ---------------------------------------------------------------------------
info "Step 5 — Configuring HTTPS:443 listener with ACM certificate"

if [[ -z "$HTTPS_LISTENER_ARN" || "$HTTPS_LISTENER_ARN" == "None" ]]; then
  log "Creating new HTTPS listener..."
  HTTPS_LISTENER_ARN=$(aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTPS \
    --port 443 \
    --certificates "CertificateArn=$CERT_ARN" \
    --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
    --default-actions "Type=forward,TargetGroupArn=$DEFAULT_TG_ARN" \
    --region "$REGION" \
    --query 'Listeners[0].ListenerArn' \
    --output text)
  ok "Created HTTPS listener: $HTTPS_LISTENER_ARN"
else
  log "HTTPS listener already exists — adding/updating certificate..."
  aws elbv2 add-listener-certificates \
    --listener-arn "$HTTPS_LISTENER_ARN" \
    --certificates "CertificateArn=$CERT_ARN" \
    --region "$REGION" || true
  ok "Certificate added to existing HTTPS listener: $HTTPS_LISTENER_ARN"
fi

# ---------------------------------------------------------------------------
# 6. Modify HTTP:80 listener → redirect to HTTPS:443
# ---------------------------------------------------------------------------
info "Step 6 — Modifying HTTP:80 listener to redirect to HTTPS"

if [[ -n "$HTTP_LISTENER_ARN" && "$HTTP_LISTENER_ARN" != "None" ]]; then
  aws elbv2 modify-listener \
    --listener-arn "$HTTP_LISTENER_ARN" \
    --default-actions \
      "Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}" \
    --region "$REGION" >/dev/null
  ok "HTTP:80 listener now redirects to HTTPS:443"
else
  log "No HTTP:80 listener found — creating redirect-only listener..."
  aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP \
    --port 80 \
    --default-actions \
      "Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}" \
    --region "$REGION" >/dev/null
  ok "Created HTTP:80 → HTTPS:443 redirect listener"
fi

# ---------------------------------------------------------------------------
# 7. Cloudflare SSL mode instructions
# ---------------------------------------------------------------------------
info "Step 7 — Cloudflare SSL/TLS mode"
echo ""
echo "============================================================"
echo "  CLOUDFLARE SSL/TLS CONFIGURATION:"
echo "============================================================"
echo ""
echo "  1. Log in to Cloudflare → mediczy.in → SSL/TLS"
echo "  2. Change SSL/TLS encryption mode from:"
echo "       Flexible  →  Full (strict)"
echo ""
echo "  Why: 'Flexible' terminates TLS at Cloudflare and sends"
echo "       plain HTTP to your ALB. With the new ACM cert on"
echo "       the ALB, 'Full (strict)' encrypts the Cloudflare"
echo "       → ALB leg and validates the ACM certificate."
echo ""
echo "  3. Optionally enable 'Always Use HTTPS' in SSL/TLS →"
echo "     Edge Certificates for belt-and-suspenders HTTP→HTTPS."
echo ""
echo "  4. Set the mediczy.in A record to proxy through Cloudflare"
echo "     (orange cloud) pointing to:"
echo "     $ALB_DNS"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# 8. Verify HTTPS endpoint
# ---------------------------------------------------------------------------
info "Step 8 — Verifying https://mediczy.in/api/health"
log "Waiting 10s for ALB listener changes to propagate..."
sleep 10

echo ""
log "Running: curl -I --max-time 15 $HEALTH_URL"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$HEALTH_URL" 2>/dev/null || echo "FAILED")

if [[ "$HTTP_STATUS" =~ ^(200|204)$ ]]; then
  ok "Health check passed — HTTP $HTTP_STATUS"
elif [[ "$HTTP_STATUS" == "FAILED" ]]; then
  warn "curl failed — Cloudflare DNS may not be pointed to ALB yet, or cert propagation in progress."
  warn "Manually verify: curl -I $HEALTH_URL"
else
  warn "Health check returned HTTP $HTTP_STATUS — review ALB target group health."
  warn "Run: curl -v $HEALTH_URL"
fi

# Full header dump for confirmation
echo ""
curl -I --max-time 15 "$HEALTH_URL" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
info "Setup complete"
echo ""
echo "Summary:"
echo "  Certificate ARN : $CERT_ARN"
echo "  HTTPS Listener  : $HTTPS_LISTENER_ARN"
echo "  HTTP Redirect   : enabled"
echo "  Cloudflare mode : change to Full (strict)"
echo ""
