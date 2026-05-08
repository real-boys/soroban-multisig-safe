---
name: Security Issue
description: Report a security vulnerability (non-critical only — for critical issues, email maintainers directly)
title: "[SECURITY]: "
labels: ["security"]
body:
  - type: markdown
    attributes:
      value: |
        ⚠️ **For critical vulnerabilities** (e.g. fund loss, key exposure), please email the maintainers directly instead of opening a public issue.

  - type: textarea
    id: description
    attributes:
      label: Vulnerability Description
      description: Describe the security issue clearly.
    validations:
      required: true

  - type: dropdown
    id: severity
    attributes:
      label: Severity
      options:
        - Low
        - Medium
        - High
    validations:
      required: true

  - type: textarea
    id: reproduction
    attributes:
      label: Steps to Reproduce
      placeholder: |
        1. ...
        2. ...
    validations:
      required: true

  - type: textarea
    id: impact
    attributes:
      label: Potential Impact
      description: What could an attacker do with this vulnerability?
    validations:
      required: true

  - type: textarea
    id: mitigation
    attributes:
      label: Suggested Mitigation
      description: If you have ideas on how to fix this, share them here.

  - type: checkboxes
    id: confirm
    attributes:
      label: Confirmation
      options:
        - label: I have verified this is not a critical vulnerability requiring private disclosure
          required: true
        - label: I have searched existing issues and this has not been reported before
          required: true
