# Security Policy

## Supported versions

`chaicore` is pre-1.0 and moves fast. Only the latest published release is supported. Fixes land
on `main` and ship in the next release; there are no backports to older versions.

| Version        | Supported |
| -------------- | --------- |
| Latest release | Yes       |
| Anything older | No        |

## Reporting a vulnerability

**Do not open a public issue, discussion, or pull request for a security problem.**

Report it privately through GitHub:

**[Report a vulnerability](https://github.com/chaibuilder/core/security/advisories/new)**

That opens a private advisory visible only to you and the maintainers. If you cannot use GitHub,
email developers@chaibuilder.com instead.

Please include:

- What the vulnerability allows an attacker to do
- The affected version and, where relevant, the database adapter and Next.js version
- Steps to reproduce, ideally a minimal project
- Any proof-of-concept code or logs

## What to expect

- **Acknowledgement** within 3 working days
- **Assessment** and a severity call within 7 days, shared with you in the advisory thread
- **Fix and release** as fast as the severity warrants, coordinated with you before disclosure
- **Credit** in the advisory and release notes, unless you would rather stay anonymous

Please give us a reasonable window to ship a fix before disclosing publicly.

## Scope

In scope: the `chaicore` package — the editor, renderer, server runtime, actions, database
adapters, and the block and binding pipelines.

Out of scope: vulnerabilities in your own application code, in third-party dependencies (report
those upstream), and findings that require an already-compromised host, physical access, or
maintainer-level repository access.

The binding engine deliberately evaluates no JavaScript: bindings resolve data paths and run
registered, non-executable pipes only. A way to execute arbitrary code through a binding is a
vulnerability and we want to hear about it.
