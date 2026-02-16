# Contributing to AegisMemory

Thank you for your interest in contributing to AegisMemory!

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/aegismemory.git
   cd aegismemory
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your wallet credentials
   ```

4. **Test the plugin**
   ```bash
   # Install in OpenClaw
   openclaw plugins install .
   openclaw plugins enable aegismemory
   ```

## Project Structure

```
aegismemory/
├── lib/                    # Core library modules
│   ├── aegisMemory.js     # Main orchestration
│   ├── anchor.js          # On-chain anchoring
│   ├── cryptoBox.js       # Encryption/decryption
│   ├── vaultApi.js        # X1 Vault IPFS client
│   ├── state.js           # Persistent state management
│   ├── queue.js           # Durable job queue
│   ├── toon.js            # TOON format serialization
│   └── ...
├── bin/                    # CLI tools
│   └── aegismemory.js     # Command-line interface
├── index.js               # OpenClaw plugin entry point
├── openclaw.plugin.json   # Plugin manifest
└── README.md              # Documentation
```

## Development Guidelines

### Code Style
- Use ES6+ features
- Follow existing code patterns
- Add JSDoc comments for functions
- Keep functions small and focused

### Testing
- Test with real X1 Vault and blockchain
- Verify encryption/decryption works
- Check on-chain anchoring
- Test queue processing

### Security
- Never commit wallet keys or secrets
- Always encrypt sensitive data
- Use environment variables for credentials
- Review crypto implementations carefully

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request

## Reporting Issues

When reporting issues, please include:
- OpenClaw version
- Node.js version
- Error messages and logs
- Steps to reproduce
- Expected vs actual behavior

## Questions?

Open an issue or reach out to the maintainers!
