---
name: Documentation
description: Report missing, incorrect, or unclear documentation
title: "[DOCS]: "
labels: ["documentation"]
body:
  - type: dropdown
    id: type
    attributes:
      label: Documentation Type
      options:
        - Missing documentation
        - Incorrect information
        - Unclear explanation
        - Outdated content
        - Other
    validations:
      required: true

  - type: input
    id: location
    attributes:
      label: Location
      description: File path or URL of the documentation in question
      placeholder: "e.g. README.md, docs/api.md, https://..."
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: Description
      description: What is wrong or missing?
    validations:
      required: true

  - type: textarea
    id: suggestion
    attributes:
      label: Suggested Improvement
      description: How should the documentation be improved?
