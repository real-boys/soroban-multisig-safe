#!/bin/bash

# High Availability Deployment Script
# This script deploys all HA components for the Stellar Multi-Sig Safe

set -e

echo "🚀 Stellar Multi-Sig Safe - High Availability Deployment"
echo "=========================================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check .env file
    if [ ! -f .env ]; then
        log_warn ".env file not found. Copying from .env.example..."
        cp .env.example .env
        log_warn "Please update .env with your configuration"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

start_backend() {
    log_info "Starting backend services..."
    
    # Build and start backend
    docker-compose up -d --build backend
    
    # Wait for backend to be healthy
    log_info "Waiting for backend to be healthy..."
    sleep 10
    
    # Check health
    if curl -f http://localhost:5001/api/health > /dev/null 2>&1; then
        log_info "Backend is healthy ✓"
    else
        log_warn "Backend health check failed. Check logs with: docker-compose logs backend"
    fi
}

start_elk_stack() {
    log_info "Starting ELK stack..."
    
    cd elk
    
    # Create necessary directories
    mkdir -p elasticsearch/logs
    mkdir -p filebeat/logs
    
    # Start ELK services
    docker-compose up -d
    
    cd ..
    
    # Wait for Elasticsearch
    log_info "Waiting for Elasticsearch to be ready..."
    sleep 30
    
    # Check Elasticsearch health
    if curl -f http://localhost:9200/_cluster/health > /dev/null 2>&1; then
        log_info "Elasticsearch is healthy ✓"
    else
        log_warn "Elasticsearch health check failed"
    fi
    
    # Check Kibana
    sleep 10
    if curl -f http://localhost:5601/api/status > /dev/null 2>&1; then
        log_info "Kibana is healthy ✓"
    else
        log_warn "Kibana health check failed"
    fi
}

start_nginx() {
    log_info "Starting Nginx reverse proxy..."
    
    # Check if SSL certificates exist
    if [ ! -d "nginx/ssl" ]; then
        log_warn "SSL certificates not found in nginx/ssl/"
        log_warn "Create self-signed certificates for testing:"
        log_warn "  mkdir -p nginx/ssl"
        log_warn "  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\"
        log_warn "    -keyout nginx/ssl/privkey.pem \\"
        log_warn "    -out nginx/ssl/fullchain.pem"
    fi
    
    # Start nginx
    docker-compose --profile production up -d nginx
    
    log_info "Nginx started ✓"
}

test_ha_features() {
    log_info "Testing high availability features..."
    
    # Test RPC Load Balancer
    echo ""
    log_info "1. Testing RPC Load Balancer..."
    response=$(curl -s http://localhost:5001/api/health)
    if echo "$response" | grep -q "UP"; then
        log_info "   ✓ Backend health check passed"
    else
        log_error "   ✗ Backend health check failed"
    fi
    
    # Test Indexer Health
    echo ""
    log_info "2. Testing Indexer Health..."
    response=$(curl -s http://localhost:5001/api/events/health)
    if echo "$response" | grep -q "status"; then
        log_info "   ✓ Indexer health endpoint responding"
    else
        log_warn "   ⚠ Indexer health endpoint not responding"
    fi
    
    # Test ELK Stack
    echo ""
    log_info "3. Testing ELK Stack..."
    if curl -f http://localhost:9200/_cluster/health > /dev/null 2>&1; then
        log_info "   ✓ Elasticsearch is running"
    else
        log_warn "   ⚠ Elasticsearch is not responding"
    fi
    
    if curl -f http://localhost:5601/api/status > /dev/null 2>&1; then
        log_info "   ✓ Kibana is running"
    else
        log_warn "   ⚠ Kibana is not responding"
    fi
    
    echo ""
    log_info "High availability tests completed"
}

show_status() {
    echo ""
    echo "=========================================="
    echo "           Deployment Status              "
    echo "=========================================="
    echo ""
    
    log_info "Services running:"
    docker-compose ps
    echo ""
    
    if [ -d "elk" ]; then
        log_info "ELK Stack services:"
        cd elk && docker-compose ps && cd ..
        echo ""
    fi
    
    log_info "Access points:"
    echo "  - Backend API:     http://localhost:5001"
    echo "  - Frontend:        http://localhost:3000"
    echo "  - Kibana:          http://localhost:5601"
    echo "  - Elasticsearch:   http://localhost:9200"
    echo ""
    
    log_info "Useful commands:"
    echo "  - View logs:       docker-compose logs -f"
    echo "  - Stop services:   docker-compose down"
    echo "  - Restart service: docker-compose restart <service>"
    echo ""
}

deploy_cloudflare() {
    log_info "Cloudflare Integration Setup"
    echo ""
    log_warn "Manual steps required for Cloudflare:"
    echo ""
    echo "1. Update your DNS records in Cloudflare:"
    echo "   - Point your domain to this server's IP"
    echo "   - Enable proxy (orange cloud)"
    echo ""
    echo "2. Configure SSL/TLS in Cloudflare:"
    echo "   - Set SSL/TLS encryption mode to 'Full (Strict)'"
    echo "   - Generate Origin Certificate"
    echo "   - Save certificate to nginx/ssl/"
    echo ""
    echo "3. Update nginx/nginx.conf with your domain:"
    echo "   - Replace 'yourdomain.com' with your actual domain"
    echo ""
    echo "4. Enable DDoS protection in Cloudflare:"
    echo "   - Go to Security > Settings"
    echo "   - Set Security Level to 'Medium'"
    echo "   - Enable 'Automatically HTTP Rewrites'"
    echo ""
}

# Main deployment
main() {
    check_prerequisites
    
    echo ""
    log_info "Starting deployment..."
    echo ""
    
    # Start backend
    start_backend
    
    # Start ELK stack
    start_elk_stack
    
    # Start nginx (optional)
    read -p "Do you want to start Nginx? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        start_nginx
    fi
    
    # Test HA features
    test_ha_features
    
    # Show status
    show_status
    
    # Cloudflare setup
    deploy_cloudflare
    
    echo ""
    log_info "Deployment completed successfully! ✓"
    echo ""
    log_warn "Next steps:"
    echo "1. Update .env with your production credentials"
    echo "2. Configure Cloudflare (see instructions above)"
    echo "3. Set up SSL certificates for Nginx"
    echo "4. Configure backup retention policy"
    echo "5. Set up alert webhooks (Slack, email, etc.)"
    echo ""
}

# Run main function
main
