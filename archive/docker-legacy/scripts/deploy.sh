#!/bin/bash

# Mediczy Production Deployment Script
# This script handles the complete Docker production deployment

set -e

echo "🚀 Starting Mediczy Production Deployment..."

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
BACKUP_DIR="./backups"

# Colors for output
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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    log_info "Prerequisites check passed ✅"
}

# Setup environment
setup_environment() {
    log_info "Setting up environment..."
    
    if [ ! -f "$ENV_FILE" ]; then
        log_warn ".env file not found. Creating from example..."
        cp .env.example .env
        log_warn "⚠️  IMPORTANT: Please edit .env file with your production values!"
        log_warn "⚠️  Change all default passwords and secrets!"
        read -p "Press enter to continue after editing .env file..."
    fi
    
    # Create necessary directories
    mkdir -p $BACKUP_DIR
    mkdir -p ./docker/ssl
    
    log_info "Environment setup completed ✅"
}

# Build and start services
deploy_services() {
    log_info "Building and starting services..."
    
    # Pull latest images
    docker-compose -f $COMPOSE_FILE pull
    
    # Build the application image
    docker-compose -f $COMPOSE_FILE build --no-cache
    
    # Start services
    docker-compose -f $COMPOSE_FILE up -d
    
    log_info "Services deployed ✅"
}

# Health check
health_check() {
    log_info "Performing health checks..."
    
    # Wait for services to start
    sleep 30
    
    # Check application health
    if curl -f -k https://localhost/health &> /dev/null; then
        log_info "Application health check passed ✅"
    else
        log_error "Application health check failed ❌"
        docker-compose -f $COMPOSE_FILE logs mediczy-app
        exit 1
    fi
    
    # Check database
    if docker-compose -f $COMPOSE_FILE exec -T mongo mongosh --eval "db.runCommand('ping')" &> /dev/null; then
        log_info "Database health check passed ✅"
    else
        log_warn "Database health check failed ⚠️"
    fi
    
    log_info "Health checks completed"
}

# Backup existing data
backup_data() {
    if [ "$1" = "--backup" ]; then
        log_info "Creating backup..."
        
        TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
        BACKUP_FILE="$BACKUP_DIR/mediczy_backup_$TIMESTAMP.tar.gz"
        
        # Backup database
        docker-compose -f $COMPOSE_FILE exec -T mongo mongodump --archive --gzip > "$BACKUP_DIR/mongo_$TIMESTAMP.gz"
        
        # Backup volumes
        docker run --rm -v mediczy_app-uploads:/data -v $(pwd)/$BACKUP_DIR:/backup alpine tar czf /backup/uploads_$TIMESTAMP.tar.gz -C /data .
        
        log_info "Backup created: $BACKUP_FILE ✅"
    fi
}

# Display status
show_status() {
    log_info "=== Mediczy Deployment Status ==="
    docker-compose -f $COMPOSE_FILE ps
    
    echo
    log_info "=== Service URLs ==="
    echo "🌐 Main Application: https://localhost"
    echo "🔧 Health Check: https://localhost/health"
    echo "📊 Mongo Express: http://localhost:8081 (dev only)"
    echo "📈 Redis Commander: http://localhost:8082 (dev only)"
    
    echo
    log_info "=== Useful Commands ==="
    echo "📋 View logs: docker-compose -f $COMPOSE_FILE logs -f"
    echo "🔄 Restart: docker-compose -f $COMPOSE_FILE restart"
    echo "⏹️  Stop: docker-compose -f $COMPOSE_FILE down"
    echo "🧹 Clean up: docker-compose -f $COMPOSE_FILE down -v --rmi all"
}

# Main deployment flow
main() {
    echo "🏥 Mediczy Healthcare Platform - Docker Deployment"
    echo "=================================================="
    
    check_prerequisites
    setup_environment
    backup_data "$@"
    deploy_services
    health_check
    show_status
    
    echo
    log_info "🎉 Deployment completed successfully!"
    log_info "🌐 Your Mediczy platform is now running at https://localhost"
}

# Handle command line arguments
case "$1" in
    "dev")
        log_info "Starting development environment..."
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
        ;;
    "down")
        log_info "Stopping all services..."
        docker-compose -f $COMPOSE_FILE down
        ;;
    "logs")
        docker-compose -f $COMPOSE_FILE logs -f "${@:2}"
        ;;
    "backup")
        backup_data --backup
        ;;
    "status")
        show_status
        ;;
    "clean")
        log_warn "This will remove all containers, volumes, and images!"
        read -p "Are you sure? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose -f $COMPOSE_FILE down -v --rmi all
            docker system prune -f
            log_info "Cleanup completed"
        fi
        ;;
    *)
        main "$@"
        ;;
esac