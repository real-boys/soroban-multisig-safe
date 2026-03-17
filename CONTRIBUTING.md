# Contributing to Stellar Multi-Sig Safe

Thank you for your interest in contributing to Stellar Multi-Sig Safe! This document provides guidelines and information to help you get started with contributing to our project.

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **Rust** (v1.70 or higher)
- **Docker** (optional, for local Stellar network)
- **Git**
- **VS Code** (recommended, with our extensions)

### Development Setup

1. **Fork the Repository**
   ```bash
   # Fork the repository on GitHub
   git clone https://github.com/YOUR_USERNAME/stellar-multisig-safe.git
   cd stellar-multisig-safe
   ```

2. **Install Dependencies**
   ```bash
   # Install all dependencies for all packages
   npm run install:all
   ```

3. **Set Up Environment Variables**
   ```bash
   # Copy environment template
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Development Environment**
   ```bash
   # Start all services in development mode
   npm run dev
   ```

## 🏗️ Project Structure

Understanding the project structure is crucial for effective contribution:

```
stellar-multisig-safe/
├── contracts/              # Stellar smart contracts (Rust/Soroban)
├── backend/               # Node.js API server
├── frontend/              # React frontend application
├── docs/                  # Documentation
├── scripts/               # Development and deployment scripts
└── tools/                 # Development tools and utilities
```

### Smart Contracts (`contracts/`)
- **Language**: Rust
- **Platform**: Soroban (Stellar)
- **Testing**: Rust's built-in test framework
- **Build**: `cargo build --target wasm32-unknown-unknown`

### Backend (`backend/`)
- **Language**: TypeScript/Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Testing**: Jest
- **Build**: `npm run build`

### Frontend (`frontend/`)
- **Language**: TypeScript/React
- **Framework**: Vite
- **UI Library**: Material-UI
- **Testing**: Vitest + Testing Library
- **Build**: `npm run build`

## 🤝 How to Contribute

### 1. Find an Issue

- **Good First Issues**: Look for issues labeled `good first issue`
- **Help Wanted**: Issues labeled `help wanted` need community assistance
- **Bug Reports**: Help us fix reported bugs
- **Feature Requests**: Implement new features

### 2. Create a Branch

```bash
# Create a feature branch from main
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

### 3. Make Your Changes

Follow our coding standards and guidelines:

#### Smart Contracts (Rust)
```rust
// Use descriptive variable names
let recovery_delay = 86400u64; // 24 hours in seconds

// Add comprehensive documentation
/// Initiates the recovery process with a time delay
/// 
/// # Arguments
/// * `new_recovery_address` - The new recovery address
/// 
/// # Returns
/// * `Result<(), MultisigError>` - Success or error
pub fn initiate_recovery(
    env: Env,
    new_recovery_address: Address,
) -> Result<(), MultisigError> {
    // Implementation
}
```

#### Backend (TypeScript)
```typescript
// Use interfaces for type safety
interface CreateWalletRequest {
  name: string;
  owners: string[];
  threshold: number;
  recoveryAddress: string;
  recoveryDelay: number;
}

// Add JSDoc comments
/**
 * Creates a new multi-signature wallet
 * @param req - Express request object
 * @param res - Express response object
 */
async function createWallet(req: Request, res: Response): Promise<void> {
  // Implementation
}
```

#### Frontend (TypeScript/React)
```typescript
// Use functional components with hooks
interface WalletCardProps {
  wallet: Wallet;
  onSign: (walletId: string) => void;
}

const WalletCard: React.FC<WalletCardProps> = ({ wallet, onSign }) => {
  // Component implementation
};

export default WalletCard;
```

### 4. Test Your Changes

#### Smart Contracts
```bash
cd contracts/soroban
cargo test
```

#### Backend
```bash
cd backend
npm run test
npm run test:coverage
```

#### Frontend
```bash
cd frontend
npm run test
npm run test:coverage
```

#### All Tests
```bash
npm run test
```

### 5. Submit Your Pull Request

1. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add wallet recovery functionality"
   ```

2. **Push to Your Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create Pull Request**
   - Go to the original repository
   - Click "New Pull Request"
   - Select your branch
   - Fill out the PR template

## 📝 Coding Standards

### General Guidelines

- **Use descriptive names** for variables, functions, and files
- **Write tests** for all new functionality
- **Update documentation** when adding features
- **Follow existing patterns** and conventions
- **Keep commits small** and focused

### Smart Contract Standards

- **Security First**: Always consider security implications
- **Gas Optimization**: Write efficient code
- **Error Handling**: Use proper error types and messages
- **Documentation**: Document all public functions

### Backend Standards

- **Type Safety**: Use TypeScript strictly
- **Error Handling**: Implement proper error responses
- **Validation**: Validate all inputs
- **Security**: Follow security best practices

### Frontend Standards

- **Component Structure**: Keep components small and focused
- **State Management**: Use appropriate state management patterns
- **Accessibility**: Ensure components are accessible
- **Performance**: Optimize for performance

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment Information**
   - OS and version
   - Node.js version
   - Browser version (for frontend issues)

2. **Steps to Reproduce**
   - Clear, numbered steps
   - Expected behavior
   - Actual behavior

3. **Additional Context**
   - Screenshots
   - Error messages
   - Related issues

## ✨ Feature Requests

When requesting features:

1. **Use the Feature Request Template**
2. **Provide Clear Description**
3. **Explain the Use Case**
4. **Consider Implementation Complexity**

## 🔍 Code Review Process

### Reviewers Focus On:

- **Code Quality**: Is the code well-written?
- **Functionality**: Does it work as expected?
- **Tests**: Are tests comprehensive?
- **Documentation**: Is it properly documented?
- **Security**: Are there security concerns?

### Review Guidelines:

- **Be Constructive**: Provide helpful feedback
- **Be Respectful**: Maintain professional communication
- **Be Thorough**: Review carefully and thoroughly
- **Be Responsive**: Address feedback promptly

## 🏷️ Issue Labels

- `bug`: Bug reports and fixes
- `enhancement`: New features and improvements
- `documentation`: Documentation updates
- `good first issue`: Good for new contributors
- `help wanted`: Community help needed
- `priority/high`: High priority issues
- `security`: Security-related issues
- `wip`: Work in progress

## 📚 Resources

### Documentation
- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/)
- [React Documentation](https://react.dev/)
- [Node.js Documentation](https://nodejs.org/docs/)

### Tools
- [VS Code Extensions](./docs/vscode-extensions.md)
- [Development Tools](./docs/development-tools.md)
- [Testing Guide](./docs/testing.md)

### Community
- [Discord Server](https://discord.gg/stellar)
- [Stellar Community](https://community.stellar.org/)
- [GitHub Discussions](https://github.com/your-org/stellar-multisig-safe/discussions)

## 🎯 Contribution Areas

We're particularly looking for contributions in:

1. **Smart Contract Development**
   - Core multi-sig logic
   - Security improvements
   - Gas optimization

2. **Backend Development**
   - API endpoints
   - Database optimization
   - Security features

3. **Frontend Development**
   - UI/UX improvements
   - Mobile responsiveness
   - Performance optimization

4. **Documentation**
   - API documentation
   - User guides
   - Tutorials

5. **Testing**
   - Unit tests
   - Integration tests
   - End-to-end tests

6. **DevOps**
   - CI/CD improvements
   - Deployment automation
   - Monitoring

## 🏆 Recognition

Contributors are recognized through:

- **Contributor List**: Listed in our README
- **Release Notes**: Mentioned in release notes
- **Community Spotlight**: Featured in community updates
- **Swag**: Receive project merchandise for significant contributions

## 📞 Getting Help

If you need help:

1. **Check Documentation**: Look for existing documentation
2. **Search Issues**: Check if your question has been answered
3. **Ask in Discussions**: Start a discussion on GitHub
4. **Join Discord**: Get real-time help from the community
5. **Contact Maintainers**: Reach out to project maintainers

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Stellar Multi-Sig Safe! Your contributions help make multi-signature wallets more secure and accessible for everyone. 🚀
