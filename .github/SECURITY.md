# Security policy

T3 + Bots is an experimental fork. Only the current public source revision receives integration fixes; there is no guaranteed response time or support for older previews.

## Report an integration vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/zznorthstar/t3-bots/security/advisories/new) for problems introduced by this fork or its bot integration. Include the affected revision, reproduction steps and impact. Do not post tokens, pairing URLs, private conversations or exploit details in a public issue. If private reporting is unavailable, open an issue asking for a private reporting channel without including vulnerability details.

Do not test against third-party systems or other users' data. A local bot desktop is not a VM or a security boundary. Keep the Bot HQ service on loopback and protect T3 access as you would access to the underlying computer.

## Upstream vulnerabilities

For a vulnerability that also affects stock T3 Code, follow [T3's security policy](https://t3.codes/security-policy). For Hermes or Bot HQ vulnerabilities, use the affected upstream project's reporting process. The [original T3 security policy](SECURITY.upstream.md) is preserved; T3's maintainers do not operate this fork or its releases.
