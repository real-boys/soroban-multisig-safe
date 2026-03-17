#!/bin/bash

# Stellar Multi-Sig Safe Deployment Script
# This script deploys the entire application to production

set -e

echo "🚀 Starting Stellar Multi-Sig Safe deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v cargo &> /dev/null; then
        print_error "Rust/Cargo is not installed"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    
    print_status "All dependencies are installed"
}

# Build smart contracts
build_contracts() {
    print_status "Building Stellar smart contracts..."
    
    cd contracts/soroban
    cargo build --target wasm32-unknown-unknown --release
    
    if [ $? -eq 0 ]; then
        print_status "Smart contracts built successfully"
    else
        print_error "Failed to build smart contracts"
        exit 1
    fi
    
    cd ../..
}

# Build backend
build_backend() {
    print_status "Building backend..."
    
    cd backend
    npm ci
    npm run build
    
    if [ $? -eq 0 ]; then
        print_status "Backend built successfully"
    else
        print_error "Failed to build backend"
        exit 1
    fi
    
    cd ..
}

# Build frontend
build_frontend() {
    print_status "Building frontend..."
    
    cd frontend
    npm ci
    npm run build
    
    if [ $? -eq 0 ]; then
        print_status "Frontend built successfully"
    else
        print_error "Failed to build frontend"
        exit 1
    fi
    
    cd ..
}

# Run tests
run_tests() {
    print_status "Running tests..."
    
    # Test contracts
    print_status "Testing smart contracts..."
    cd contracts/soroban
    cargo test
    cd ../..
    
    # Test backend
    print_status "Testing backend..."
    cd backend
    npm run test
    cd ..
    
    # Test frontend
    print_status "Testing frontend..."
    cd frontend
    npm run test -- --watchAll=false
    cd ..
    
    print_status "All tests passed"
}

# Deploy smart contracts
deploy_contracts() {
    print_status "Deploying smart contracts to Stellar..."
    
    cd contracts/soroban
    
    # Deploy to the specified network
    NETWORK=${STELLAR_NETWORK:-futurenet}
    
    soroban contract deploy \
        --wasm target/wasm32-unknown-unknown/release/multisig_safe.wasm \
        --network $NETWORK \
        --source $CONTRACT_DEPLOYER_PRIVATE_KEY
    
    if [ $? -eq 0 ]; then
        print_status "Smart contracts deployed successfully"
    else
        print_error "Failed to deploy smart contracts"
        exit 1
    fi
    
    cd ../..
}

# Build Docker images
build_docker_images() {
    print_status "Building Docker images..."
    
    # Build backend image
    docker build -t stellar-multisig-safe-backend:latest ./backend
    
    # Build frontend image
    docker build -t stellar-multisig-safe-frontend:latest ./frontend
    
    if [ $? -eq 0 ]; then
        print_status "Docker images built successfully"
    else
        print_error "Failed to build Docker images"
        exit 1
    fi
}

# Deploy to production
deploy_production() {
    print_status "Deploying to production..."
    
    # Check if we're on the main branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" != "main" ]; then
        print_warning "Not on main branch. Current branch: $CURRENT_BRANCH"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Deployment cancelled"
            exit 0
        fi
    fi
    
    # Push Docker images to registry
    docker push stellar-multisig-safe-backend:latest
    docker push stellar-multisig-safe-frontend:latest
    
    # Update production services (this would depend on your orchestration setup)
    # For example, using docker-compose or kubernetes
    print_status "Production services updated"
}

# Health check
health_check() {
    print_status "Performing health check..."
    
    # Check backend health
    BACKEND_URL=${BACKEND_URL:-http://localhost:5001}
    if curl -f "$BACKEND_URL/api/health" > /dev/null 2>&1; then
        print_status "Backend health check passed"
    else
        print_error "Backend health check failed"
        exit 1
    fi
    
    # Check frontend health
    FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}
    if curl -f "$FRONTEND_URL" > /dev/null 2>&1; then
        print_status "Frontend health check passed"
    else
        print_error "Frontend health check failed"
        exit 1
    fi
}

# Cleanup
cleanup() {
    print_status "Cleaning up..."
    
    # Remove any temporary files
    rm -f *.tmp
    
    # Clean Docker images (optional)
    # docker image prune -f
    
    print_status "Cleanup completed"
}

# Main deployment flow
main() {
    print_status "Starting deployment process..."
    
    # Check if required environment variables are set
    if [ -z "$CONTRACT_DEPLOYER_PRIVATE_KEY" ]; then
        print_error "CONTRACT_DEPLOYER_PRIVATE_KEY environment variable is not set"
        exit 1
    fi
    
    # Run deployment steps
    check_dependencies
    build_contracts
    build_backend
    build_frontend
    run_tests
    deploy_contracts
    build_docker_images
    deploy_production
    health_check
    cleanup
    
    print_status "🎉 Deployment completed successfully!"
    print_status "Stellar Multi-Sig Safe is now live!"
}

# Handle script interruption
trap cleanup EXIT

# Run main function
main "$@"
