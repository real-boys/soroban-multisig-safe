---
name: Bug Report
description: File a bug report to help us improve
title: "[BUG]: "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to fill out this bug report! Please provide as much detail as possible.

  - type: textarea
    id: bug-description
    attributes:
      label: Bug Description
      description: A clear and concise description of what the bug is.
      placeholder: Describe the bug...
    validations:
      required: true

  - type: textarea
    id: reproduction-steps
    attributes:
      label: Reproduction Steps
      description: Steps to reproduce the behavior
      placeholder: |
        1. Go to '...'
        2. Click on '....'
        3. Scroll down to '....'
        4. See error
    validations:
      required: true

  - type: textarea
    id: expected-behavior
    attributes:
      label: Expected Behavior
      description: A clear description of what you expected to happen
      placeholder: What should have happened...
    validations:
      required: true

  - type: textarea
    id: actual-behavior
    attributes:
      label: Actual Behavior
      description: A clear description of what actually happened
      placeholder: What actually happened...
    validations:
      required: true

  - type: dropdown
    id: component
    attributes:
      label: Component
      description: Which component is affected?
      options:
        - Smart Contracts
        - Backend API
        - Frontend
        - Documentation
        - Other
    validations:
      required: true

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      description: How urgent is this bug?
      options:
        - Low - Minor inconvenience
        - Medium - Affects functionality
        - High - Blocks core features
        - Critical - Security vulnerability or data loss
    validations:
      required: true

  - type: textarea
    id: environment
    attributes:
      label: Environment Information
      description: Please provide your environment details
      placeholder: |
        - OS: [e.g. Ubuntu 20.04, Windows 11, macOS 13.0]
        - Node.js version: [e.g. v18.17.0]
        - Rust version: [e.g. 1.70.0]
        - Browser: [e.g. Chrome 119, Firefox 118]
        - Network: [e.g. Mainnet, Testnet, Local]
    validations:
      required: true

  - type: textarea
    id: error-messages
    attributes:
      label: Error Messages
      description: Copy and paste any error messages you're seeing
      render: shell

  - type: textarea
    id: screenshots
    attributes:
      label: Screenshots
      description: Add screenshots or screen recordings to help explain your problem
      placeholder: Drag and drop images here...

  - type: textarea
    id: additional-context
    attributes:
      label: Additional Context
      description: Add any other context about the problem here
      placeholder: Any additional information...

  - type: checkboxes
    id: terms
    attributes:
      label: Confirmation
      description: Please confirm the following
      options:
        - label: I have searched existing issues for similar bugs
          required: true
        - label: I have provided enough information to reproduce the issue
          required: true
        - label: This is not a security vulnerability (security issues should be reported privately)
          required: true
