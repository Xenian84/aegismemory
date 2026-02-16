#!/bin/bash
# Install Solana CLI if not present

# Add to PATH for this session
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

if ! command -v solana &> /dev/null; then
    echo "Installing Solana CLI..."
    curl -sSfL https://release.solana.com/stable/install | sh
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
    
    # Add to bashrc if not already there
    if ! grep -q "solana/install/active_release/bin" ~/.bashrc; then
        echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
    fi
    
    echo "✅ Solana CLI installed"
else
    echo "✅ Solana CLI already installed"
fi

echo ""
echo "Solana CLI version:"
solana --version

echo ""
echo "To use Solana CLI in new terminals, run:"
echo "  source ~/.bashrc"
echo "Or add to your current session:"
echo '  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"'
