# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities.

2. **Use GitHub Security Advisories**: Go to the [Security tab](https://github.com/Daghis/teamcity-mcp/security/advisories) and click "Report a
vulnerability".

3. **Email**: Alternatively, you can email security concerns to the maintainers directly.

## Response Timeline

- We aim to acknowledge receipt within 48 hours.
- We will provide an initial assessment within 7 days.
- We will work with you to understand and resolve the issue promptly.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < 1.0   | :x:                |

## Security Measures

This repository has the following security measures enabled:

- **Secret scanning**: Automatically detects accidentally committed secrets
- **Push protection**: Blocks pushes containing secrets
- **Dependabot**: Monitors dependencies for known vulnerabilities

## Best Practices for Users

- Never commit your `TEAMCITY_TOKEN` or other credentials to version control
- Use environment variables or secure secret management for sensitive configuration
- Regularly rotate your TeamCity access tokens
- Use tokens with minimal required permissions
