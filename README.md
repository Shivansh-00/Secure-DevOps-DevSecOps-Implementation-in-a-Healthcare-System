# 🔐 Secure DevOps (DevSecOps) for Healthcare System

A production-style reference implementation of a **secure healthcare patient-records API** wired into a **DevSecOps CI/CD pipeline**. Security is integrated at every stage: code, dependencies, container, manifests, runtime, and operations — with a HIPAA-aligned compliance mindset.

```
Developer → GitHub → Jenkins/GH Actions →
  Secrets Scan → SAST → Dep Scan → Build → Container Scan → Sign →
  K8s Manifest Scan → Deploy (K8s) → DAST → Monitoring/Audit
```

## 📦 What's inside

| Layer | Tech | File(s) |
|---|---|---|
| App | Node.js 18 + Express + Mongoose | [src/](src/) |
| Auth | bcrypt (cost 12), JWT, RBAC, account lockout | [src/middleware/auth.js](src/middleware/auth.js), [src/middleware/rbac.js](src/middleware/rbac.js) |
| PHI protection | AES-256-GCM field-level encryption | [src/utils/encryption.js](src/utils/encryption.js) |
| Secure coding | Helmet, CORS, rate-limit, mongo-sanitize, xss-clean, hpp, express-validator | [src/server.js](src/server.js) |
| Audit | Winston JSON audit log | [src/middleware/auditLogger.js](src/middleware/auditLogger.js) |
| Tests | Jest + supertest | [tests/](tests/) |
| Container | Hardened multi-stage, non-root, healthcheck | [Dockerfile](Dockerfile) |
| Local stack | App + Mongo + Prom + Grafana | [docker-compose.yml](docker-compose.yml) |
| Kubernetes | Restricted PSA, RBAC, NetworkPolicy, RO root FS, HPA, Ingress+TLS | [k8s/](k8s/) |
| CI/CD | Jenkins (full pipeline) + GitHub Actions | [Jenkinsfile](Jenkinsfile), [.github/workflows/devsecops.yml](.github/workflows/devsecops.yml) |
| SAST / SCA / Secrets / Container / DAST | SonarQube, npm audit, OWASP DC, GitLeaks, Trivy, OWASP ZAP | [sonar-project.properties](sonar-project.properties), [.gitleaks.toml](.gitleaks.toml) |
| GitOps | ArgoCD Application | [gitops/argocd-application.yaml](gitops/argocd-application.yaml) |
| Monitoring | Prometheus scrape + alerts (latency, 5xx, brute-force) | [monitoring/](monitoring/) |

## 🚀 Quick start (local)

```bash
cp .env.example .env
# generate real secrets:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('PHI_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"

docker compose up --build
# API:        http://localhost:3000
# Metrics:    http://localhost:3000/metrics
# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3001
```

### Try the API

```bash
# Register a doctor
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"doc@h.io","password":"StrongP@ssw0rd!23","name":"Dr A","role":"doctor"}'

# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doc@h.io","password":"StrongP@ssw0rd!23"}' | jq -r .token)

# Create patient (PHI is encrypted at rest)
curl -X POST http://localhost:3000/api/patients \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"ownerId":"<patient-user-id>","fullName":"John Doe","ssn":"123-45-6789","diagnosis":"..."}'
```

## 🔒 Security controls implemented

### Application (OWASP Top 10)
- **A01 Broken Access Control** → JWT + RBAC + per-record ownership check ([patients.js](src/routes/patients.js#L13-L20))
- **A02 Cryptographic Failures** → bcrypt(12) for passwords, AES-256-GCM for PHI fields, HSTS, TLS-only ingress
- **A03 Injection** → Mongoose ORM, `express-mongo-sanitize`, `express-validator`, parameterized queries only
- **A04 Insecure Design** → Account lockout, rate limiting, password complexity, audit trail
- **A05 Security Misconfig** → Helmet CSP/HSTS, no stack traces in errors, env-only secrets
- **A07 Auth Failures** → Login rate limit (5/15m), account lockout, JWT short TTL (15m), strong password policy
- **A09 Logging** → Winston structured audit log on every PHI access

### Container
- Multi-stage build, Alpine base, **non-root user**, dropped caps, read-only root FS, healthcheck
- Trivy scan blocks `HIGH/CRITICAL` CVEs in CI

### Kubernetes
- `restricted` Pod Security Admission on the namespace
- `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `drop: [ALL]`, `seccompProfile: RuntimeDefault`
- Default-deny **NetworkPolicy** + explicit allow for ingress→app and app→mongo
- RBAC: dedicated ServiceAccount with minimal Role
- Secrets via `Secret` (recommend Sealed-Secrets / External Secrets Operator in prod)
- TLS-terminating Ingress with `force-ssl-redirect`

### Pipeline
1. **GitLeaks** – secret detection (build fails on hit)
2. **SonarQube** – SAST + Quality Gate
3. **npm audit + OWASP Dependency-Check** – SCA, fail on CVSS≥7
4. **Trivy** – container CVE scan, fail on HIGH/CRITICAL
5. **Kubesec** – K8s manifest hardening score
6. **OWASP ZAP** – baseline DAST against deployed env

## 🏥 HIPAA-aligned compliance mindset

| Safeguard | Implementation |
|---|---|
| Encryption in transit | HTTPS-only ingress, HSTS preload, redirect middleware |
| Encryption at rest | AES-256-GCM PHI fields + (recommended) encrypted PVC |
| Access control | RBAC roles: `patient`/`doctor`/`admin` + per-record ownership |
| Audit trail | Winston audit log on every `/api/auth` and `/api/patients` request |
| Authentication | bcrypt(12), strong password policy, account lockout, short-lived JWTs |
| Backup | Mongo PVC + (recommended) `velero` scheduled snapshots |
| Least privilege | Non-root containers, dropped caps, NetworkPolicy default-deny, K8s RBAC |

## ☸️ Deploy to Kubernetes

```bash
# 1. Create real secrets (do NOT use placeholder values)
kubectl create namespace healthcare
kubectl -n healthcare create secret generic healthcare-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -hex 48) \
  --from-literal=PHI_ENCRYPTION_KEY=$(openssl rand -base64 32) \
  --from-literal=MONGO_URI='mongodb://mongo:27017/healthcare'

# 2. Apply manifests
kubectl apply -f k8s/

# 3. (Optional) GitOps via ArgoCD
kubectl apply -f gitops/argocd-application.yaml
```

## 🧪 Run tests

```bash
npm ci
npm test
```

## ⚠️ Production hardening checklist

- [ ] Replace placeholder secrets in [k8s/10-secrets.yaml](k8s/10-secrets.yaml) with Sealed-Secrets / ESO
- [ ] Enable MongoDB auth + TLS + encrypted storage class
- [ ] Pin all base images by digest (e.g. `node@sha256:…`)
- [ ] Sign images with `cosign` and verify in admission (Kyverno / Gatekeeper)
- [ ] Send audit logs to immutable backend (CloudWatch / Loki / SIEM)
- [ ] Enable WAF on the ingress (ModSecurity CRS)
- [ ] Configure Velero backups for `healthcare` namespace
- [ ] Run penetration test before go-live

## 📜 License

For educational / reference use.
