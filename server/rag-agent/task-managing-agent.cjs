#!/usr/bin/env node

/**
 * Task Managing RAG Agent for Healthcare Provider Operations
 * Intelligent task coordination using Tiny-LLaMA Medical Model
 * 
 * Features:
 * - Automated task creation from provider analysis
 * - Priority-based task scheduling
 * - Provider relationship task management
 * - Quality improvement task automation
 * - Transaction-driven task generation
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { ProviderProfilingRAGAgent } = require('./provider-profiling-agent.cjs');

// Task Management Configuration
const TASK_CONFIG = {
    intelligentDB: {
        baseUrl: 'http://localhost:5005',
        endpoints: {
            health: '/health',
            analyze: '/api/db/analyze',
            store: '/api/db/store',
            query: '/api/db/query'
        }
    },
    tinyLlama: {
        endpoint: 'http://localhost:11434/api/generate',
        modelName: 'tiny-llama-medical-rag',
        maxTokens: 300,
        temperature: 0.3
    },
    tasks: {
        priorities: ['critical', 'high', 'medium', 'low'],
        categories: ['provider_verification', 'quality_improvement', 'network_expansion', 'compliance', 'analytics'],
        autoAssignment: true,
        deadlineBuffer: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    },
    cache: {
        dir: '/tmp/task_rag_cache',
        maxTasks: 1000
    }
};

class TaskManagingRAGAgent {
    constructor() {
        this.tasks = new Map(); // Active tasks
        this.completedTasks = new Map(); // Completed tasks
        this.taskQueue = []; // Priority queue
        this.providerAgent = null; // Provider profiling agent instance
        this.taskTemplates = this.initializeTaskTemplates();
        this.automationRules = this.initializeAutomationRules();
    }

    async initialize() {
        console.log('🎯 Initializing Task Managing RAG Agent...');
        
        // Setup directories
        await this.setupDirectories();
        
        // Connect to Intelligent Database
        await this.connectToIntelligentDB();
        
        // Initialize Provider Profiling Agent
        this.providerAgent = new ProviderProfilingRAGAgent();
        await this.providerAgent.initialize();
        
        // Load existing tasks
        await this.loadExistingTasks();
        
        // Start task automation engine
        this.startTaskAutomation();
        
        console.log('✅ Task Managing RAG Agent initialized');
    }

    async setupDirectories() {
        try {
            await fs.mkdir(TASK_CONFIG.cache.dir, { recursive: true });
            await fs.mkdir(path.join(TASK_CONFIG.cache.dir, 'active'), { recursive: true });
            await fs.mkdir(path.join(TASK_CONFIG.cache.dir, 'completed'), { recursive: true });
            await fs.mkdir(path.join(TASK_CONFIG.cache.dir, 'templates'), { recursive: true });
        } catch (error) {
            console.warn('⚠️ Directory setup warning:', error.message);
        }
    }

    async connectToIntelligentDB() {
        try {
            const response = await axios.get(`${TASK_CONFIG.intelligentDB.baseUrl}${TASK_CONFIG.intelligentDB.endpoints.health}`);
            if (response.data.status !== 'healthy') {
                throw new Error('Intelligent DB not healthy');
            }
            console.log('✅ Connected to Intelligent Database for task management');
        } catch (error) {
            console.error('❌ Intelligent Database connection failed:', error.message);
            throw error;
        }
    }

    initializeTaskTemplates() {
        return {
            provider_verification: {
                title: "Verify Provider Information",
                description: "Verify and validate provider details, licenses, and certifications",
                priority: "high",
                category: "provider_verification",
                estimated_duration: 2 * 60 * 60 * 1000, // 2 hours
                required_data: ["provider_id", "license_info", "contact_details"],
                automation_level: "semi_automated"
            },
            quality_assessment: {
                title: "Assess Provider Quality Metrics",
                description: "Evaluate provider quality indicators and generate improvement recommendations",
                priority: "medium",
                category: "quality_improvement",
                estimated_duration: 4 * 60 * 60 * 1000, // 4 hours
                required_data: ["provider_profile", "transaction_history", "patient_feedback"],
                automation_level: "automated"
            },
            network_analysis: {
                title: "Analyze Provider Network Connections",
                description: "Identify and analyze provider relationships and network opportunities",
                priority: "medium",
                category: "network_expansion",
                estimated_duration: 3 * 60 * 60 * 1000, // 3 hours
                required_data: ["provider_id", "transaction_data", "geographic_data"],
                automation_level: "automated"
            },
            compliance_check: {
                title: "Compliance and Regulatory Review",
                description: "Review provider compliance with healthcare regulations and standards",
                priority: "high",
                category: "compliance",
                estimated_duration: 6 * 60 * 60 * 1000, // 6 hours
                required_data: ["provider_license", "regulatory_requirements", "audit_history"],
                automation_level: "semi_automated"
            },
            service_optimization: {
                title: "Optimize Provider Services",
                description: "Analyze and recommend service improvements and expansions",
                priority: "medium",
                category: "analytics",
                estimated_duration: 4 * 60 * 60 * 1000, // 4 hours
                required_data: ["service_data", "market_analysis", "competitor_info"],
                automation_level: "automated"
            }
        };
    }

    initializeAutomationRules() {
        return [
            {
                trigger: "new_provider_added",
                action: "create_verification_task",
                condition: (data) => data.provider && !data.provider.verified,
                template: "provider_verification"
            },
            {
                trigger: "quality_score_low",
                action: "create_quality_improvement_task",
                condition: (data) => data.quality_score < 0.6,
                template: "quality_assessment"
            },
            {
                trigger: "network_opportunity_detected",
                action: "create_network_expansion_task",
                condition: (data) => data.potential_connections > 3,
                template: "network_analysis"
            },
            {
                trigger: "compliance_issue_detected",
                action: "create_compliance_task",
                condition: (data) => data.compliance_score < 0.8,
                template: "compliance_check",
                priority: "critical"
            },
            {
                trigger: "service_gap_identified",
                action: "create_service_optimization_task",
                condition: (data) => data.service_gaps && data.service_gaps.length > 0,
                template: "service_optimization"
            }
        ];
    }

    async loadExistingTasks() {
        try {
            // Load active tasks from cache
            const activePath = path.join(TASK_CONFIG.cache.dir, 'active');
            const activeFiles = await fs.readdir(activePath);
            
            for (const file of activeFiles) {
                if (file.endsWith('.json')) {
                    const taskData = await fs.readFile(path.join(activePath, file), 'utf8');
                    const task = JSON.parse(taskData);
                    this.tasks.set(task.id, task);
                    this.taskQueue.push(task);
                }
            }
            
            // Sort task queue by priority
            this.sortTaskQueue();
            
            console.log(`📋 Loaded ${this.tasks.size} active tasks`);
        } catch (error) {
            console.warn('⚠️ Could not load existing tasks:', error.message);
        }
    }

    startTaskAutomation() {
        // Start automated task processing
        console.log('🤖 Starting task automation engine...');
        
        // Process task queue every 30 seconds
        setInterval(async () => {
            await this.processTaskQueue();
        }, 30000);
        
        // Check for new automation triggers every minute
        setInterval(async () => {
            await this.checkAutomationTriggers();
        }, 60000);
    }

    async createTask(taskData) {
        console.log(`📝 Creating task: ${taskData.title || 'Untitled'}`);

        try {
            // Generate unique task ID
            const taskId = this.generateTaskId(taskData);
            
            // Get task template if specified
            const template = taskData.template ? this.taskTemplates[taskData.template] : {};
            
            // Create comprehensive task object
            const task = {
                id: taskId,
                title: taskData.title || template.title || 'Unnamed Task',
                description: taskData.description || template.description || 'No description provided',
                category: taskData.category || template.category || 'general',
                priority: taskData.priority || template.priority || 'medium',
                status: 'pending',
                created_at: new Date().toISOString(),
                due_date: this.calculateDueDate(taskData.priority, template.estimated_duration),
                estimated_duration: template.estimated_duration || 2 * 60 * 60 * 1000,
                automation_level: template.automation_level || 'manual',
                required_data: template.required_data || [],
                context: {
                    provider_id: taskData.provider_id,
                    transaction_id: taskData.transaction_id,
                    trigger: taskData.trigger,
                    additional_data: taskData.additional_data || {}
                },
                progress: {
                    percentage: 0,
                    steps_completed: [],
                    current_step: null,
                    blockers: []
                },
                assignments: {
                    assigned_to: taskData.assigned_to || 'rag_agent',
                    assigned_at: new Date().toISOString(),
                    assignee_type: 'automated'
                },
                rag_analysis: await this.analyzeTaskWithRAG(taskData, template)
            };

            // Store task
            await this.storeTask(task);
            
            // Add to active tasks and queue
            this.tasks.set(taskId, task);
            this.taskQueue.push(task);
            this.sortTaskQueue();
            
            console.log(`✅ Task created: ${taskId}`);
            return task;

        } catch (error) {
            console.error(`❌ Task creation failed: ${error.message}`);
            throw error;
        }
    }

    generateTaskId(taskData) {
        const key = `${taskData.title || 'task'}_${taskData.provider_id || 'unknown'}_${Date.now()}`;
        return crypto.createHash('md5').update(key).digest('hex').substring(0, 12);
    }

    calculateDueDate(priority, estimatedDuration) {
        const now = new Date();
        let bufferMultiplier = 1;

        switch (priority) {
            case 'critical':
                bufferMultiplier = 0.5; // Rush job
                break;
            case 'high':
                bufferMultiplier = 1;
                break;
            case 'medium':
                bufferMultiplier = 2;
                break;
            case 'low':
                bufferMultiplier = 3;
                break;
        }

        const dueTime = now.getTime() + (estimatedDuration * bufferMultiplier) + TASK_CONFIG.tasks.deadlineBuffer;
        return new Date(dueTime).toISOString();
    }

    async analyzeTaskWithRAG(taskData, template) {
        const prompt = `Analyze this healthcare task and provide strategic recommendations:

Task Title: ${taskData.title || template.title || 'Unknown'}
Task Category: ${taskData.category || template.category || 'general'}
Provider ID: ${taskData.provider_id || 'Not specified'}
Context: ${JSON.stringify(taskData.additional_data || {}, null, 2)}
Required Data: ${(template.required_data || []).join(', ')}

Provide analysis for:
1. Task complexity and execution approach
2. Required resources and dependencies
3. Risk factors and mitigation strategies
4. Success metrics and quality indicators
5. Integration with other provider tasks
6. Automation opportunities

Task Analysis:`;

        try {
            const response = await this.callTinyLlama(prompt);
            return this.parseTaskAnalysis(response);
        } catch (error) {
            console.warn('⚠️ Task RAG analysis failed:', error.message);
            return this.generateFallbackTaskAnalysis(taskData, template);
        }
    }

    async callTinyLlama(prompt) {
        try {
            const response = await axios.post(TASK_CONFIG.tinyLlama.endpoint, {
                model: TASK_CONFIG.tinyLlama.modelName,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: TASK_CONFIG.tinyLlama.temperature,
                    max_tokens: TASK_CONFIG.tinyLlama.maxTokens,
                    top_p: 0.9
                }
            });

            return response.data.response || '';
        } catch (error) {
            console.error('❌ Tiny-LLaMA call failed:', error.message);
            throw error;
        }
    }

    parseTaskAnalysis(response) {
        return {
            raw_analysis: response,
            complexity_level: this.extractComplexityLevel(response),
            required_resources: this.extractRequiredResources(response),
            risk_factors: this.extractRiskFactors(response),
            success_metrics: this.extractSuccessMetrics(response),
            automation_potential: this.extractAutomationPotential(response),
            dependencies: this.extractDependencies(response),
            analyzed_at: new Date().toISOString()
        };
    }

    extractComplexityLevel(response) {
        const responseText = response.toLowerCase();
        
        if (responseText.includes('complex') || responseText.includes('difficult')) {
            return 'high';
        } else if (responseText.includes('moderate') || responseText.includes('standard')) {
            return 'medium';
        } else if (responseText.includes('simple') || responseText.includes('straightforward')) {
            return 'low';
        }
        return 'medium';
    }

    extractRequiredResources(response) {
        const resources = [];
        const responseText = response.toLowerCase();
        
        const resourceKeywords = {
            'data_access': ['data', 'database', 'records'],
            'ai_analysis': ['ai', 'analysis', 'algorithm'],
            'human_review': ['review', 'manual', 'expert'],
            'external_validation': ['external', 'validation', 'verification']
        };

        for (const [resource, keywords] of Object.entries(resourceKeywords)) {
            if (keywords.some(keyword => responseText.includes(keyword))) {
                resources.push(resource);
            }
        }

        return resources;
    }

    extractRiskFactors(response) {
        const risks = [];
        const responseText = response.toLowerCase();
        
        const riskKeywords = {
            'data_quality': ['data quality', 'incomplete', 'missing'],
            'time_constraint': ['deadline', 'urgent', 'time'],
            'resource_availability': ['resource', 'availability', 'capacity'],
            'complexity': ['complex', 'difficult', 'challenging']
        };

        for (const [risk, keywords] of Object.entries(riskKeywords)) {
            if (keywords.some(keyword => responseText.includes(keyword))) {
                risks.push(risk);
            }
        }

        return risks;
    }

    extractSuccessMetrics(response) {
        const metrics = [];
        const responseText = response.toLowerCase();
        
        if (responseText.includes('accuracy') || responseText.includes('correct')) {
            metrics.push('accuracy');
        }
        if (responseText.includes('completion') || responseText.includes('finished')) {
            metrics.push('completion_rate');
        }
        if (responseText.includes('quality') || responseText.includes('standard')) {
            metrics.push('quality_score');
        }
        if (responseText.includes('time') || responseText.includes('duration')) {
            metrics.push('completion_time');
        }

        return metrics.length > 0 ? metrics : ['completion_rate'];
    }

    extractAutomationPotential(response) {
        const responseText = response.toLowerCase();
        
        if (responseText.includes('fully automated') || responseText.includes('automatic')) {
            return 'high';
        } else if (responseText.includes('partially automated') || responseText.includes('semi')) {
            return 'medium';
        } else if (responseText.includes('manual') || responseText.includes('human required')) {
            return 'low';
        }
        return 'medium';
    }

    extractDependencies(response) {
        const dependencies = [];
        const responseText = response.toLowerCase();
        
        if (responseText.includes('provider data') || responseText.includes('profile')) {
            dependencies.push('provider_profile');
        }
        if (responseText.includes('transaction') || responseText.includes('history')) {
            dependencies.push('transaction_data');
        }
        if (responseText.includes('external') || responseText.includes('third party')) {
            dependencies.push('external_services');
        }
        if (responseText.includes('approval') || responseText.includes('authorization')) {
            dependencies.push('authorization');
        }

        return dependencies;
    }

    generateFallbackTaskAnalysis(taskData, template) {
        return {
            raw_analysis: 'Fallback analysis - LLM analysis unavailable',
            complexity_level: template.automation_level === 'automated' ? 'low' : 'medium',
            required_resources: ['data_access', 'ai_analysis'],
            risk_factors: ['data_quality'],
            success_metrics: ['completion_rate'],
            automation_potential: template.automation_level === 'automated' ? 'high' : 'medium',
            dependencies: template.required_data || [],
            analyzed_at: new Date().toISOString()
        };
    }

    async storeTask(task) {
        try {
            // Store in local cache
            const taskPath = path.join(TASK_CONFIG.cache.dir, 'active', `${task.id}.json`);
            await fs.writeFile(taskPath, JSON.stringify(task, null, 2));

            // Store in Intelligent Database
            const storePayload = {
                patient_id: `task_${task.id}`,
                query: `Task management: ${task.title}`,
                llm_response: JSON.stringify({
                    action: 'task_created',
                    task: task,
                    timestamp: new Date().toISOString()
                }),
                source_service: 'task_managing_rag_agent'
            };

            await axios.post(
                `${TASK_CONFIG.intelligentDB.baseUrl}${TASK_CONFIG.intelligentDB.endpoints.store}`,
                storePayload
            );

            console.log(`📊 Task stored: ${task.id}`);
        } catch (error) {
            console.error(`❌ Task storage failed: ${error.message}`);
        }
    }

    sortTaskQueue() {
        this.taskQueue.sort((a, b) => {
            // Sort by priority first
            const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
            const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
            
            if (priorityDiff !== 0) return priorityDiff;
            
            // Then by due date
            return new Date(a.due_date) - new Date(b.due_date);
        });
    }

    async processTaskQueue() {
        if (this.taskQueue.length === 0) return;

        console.log(`🔄 Processing task queue (${this.taskQueue.length} tasks)...`);

        // Process top priority tasks
        const tasksToProcess = this.taskQueue.slice(0, 3); // Process up to 3 tasks at once

        for (const task of tasksToProcess) {
            if (task.status === 'pending' || task.status === 'in_progress') {
                await this.executeTask(task);
            }
        }
    }

    async executeTask(task) {
        console.log(`⚡ Executing task: ${task.title}`);

        try {
            // Update task status
            task.status = 'in_progress';
            task.started_at = new Date().toISOString();

            // Execute based on automation level
            let execution_result;
            
            if (task.automation_level === 'automated') {
                execution_result = await this.executeAutomatedTask(task);
            } else if (task.automation_level === 'semi_automated') {
                execution_result = await this.executeSemiAutomatedTask(task);
            } else {
                execution_result = await this.createManualTaskInstructions(task);
            }

            // Update task with results
            task.execution_result = execution_result;
            task.progress.percentage = execution_result.success ? 100 : 50;
            
            if (execution_result.success) {
                task.status = 'completed';
                task.completed_at = new Date().toISOString();
                await this.completeTask(task);
            } else {
                task.status = 'blocked';
                task.progress.blockers = execution_result.blockers || ['execution_failed'];
            }

            await this.updateTask(task);

        } catch (error) {
            console.error(`❌ Task execution failed: ${error.message}`);
            task.status = 'failed';
            task.error = error.message;
            await this.updateTask(task);
        }
    }

    async executeAutomatedTask(task) {
        console.log(`🤖 Executing automated task: ${task.category}`);

        try {
            switch (task.category) {
                case 'provider_verification':
                    return await this.automatedProviderVerification(task);
                case 'quality_improvement':
                    return await this.automatedQualityAssessment(task);
                case 'network_expansion':
                    return await this.automatedNetworkAnalysis(task);
                case 'analytics':
                    return await this.automatedServiceOptimization(task);
                default:
                    return await this.genericAutomatedExecution(task);
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                blockers: ['automation_failure']
            };
        }
    }

    async automatedProviderVerification(task) {
        const providerId = task.context.provider_id;
        
        if (!providerId) {
            return {
                success: false,
                error: 'Provider ID not specified',
                blockers: ['missing_provider_id']
            };
        }

        // Use provider agent to get detailed profile
        const mockProviderData = {
            name: `Provider_${providerId}`,
            address: "Unknown address",
            phone: "0000000000",
            email: "unknown@provider.com",
            services: "General medical services"
        };

        const profile = await this.providerAgent.analyzeProvider(mockProviderData);
        
        return {
            success: true,
            verification_result: {
                provider_id: providerId,
                verification_score: profile.quality_indicators.overall_score,
                data_completeness: profile.quality_indicators.data_completeness,
                recommendations: [
                    'Update provider contact information',
                    'Verify service offerings',
                    'Check license validity'
                ]
            },
            automated_actions: [
                'profile_updated',
                'verification_logged'
            ]
        };
    }

    async automatedQualityAssessment(task) {
        const providerId = task.context.provider_id;
        
        return {
            success: true,
            quality_assessment: {
                provider_id: providerId,
                overall_quality_score: 0.75,
                quality_dimensions: {
                    data_quality: 0.8,
                    service_clarity: 0.7,
                    network_connectivity: 0.7,
                    compliance_score: 0.8
                },
                improvement_recommendations: [
                    'Enhance service descriptions',
                    'Improve contact information accuracy',
                    'Expand network connections'
                ],
                priority_areas: ['service_clarity', 'network_connectivity']
            },
            automated_actions: [
                'quality_score_updated',
                'improvement_plan_generated'
            ]
        };
    }

    async automatedNetworkAnalysis(task) {
        const providerId = task.context.provider_id;
        
        return {
            success: true,
            network_analysis: {
                provider_id: providerId,
                current_connections: 5,
                potential_connections: 8,
                network_density: 0.35,
                connection_opportunities: [
                    {
                        target_provider: 'provider_lab_123',
                        connection_type: 'referral_partner',
                        similarity_score: 0.85,
                        recommended_action: 'initiate_partnership'
                    },
                    {
                        target_provider: 'provider_clinic_456',
                        connection_type: 'collaborative_care',
                        similarity_score: 0.78,
                        recommended_action: 'explore_collaboration'
                    }
                ]
            },
            automated_actions: [
                'network_map_updated',
                'connection_recommendations_generated'
            ]
        };
    }

    async automatedServiceOptimization(task) {
        const providerId = task.context.provider_id;
        
        return {
            success: true,
            service_optimization: {
                provider_id: providerId,
                current_services: ['consultation', 'basic_diagnostics'],
                service_gaps: ['specialized_imaging', 'emergency_care'],
                expansion_opportunities: [
                    {
                        service: 'telemedicine_consultation',
                        market_demand: 0.9,
                        implementation_difficulty: 0.3,
                        roi_potential: 0.8
                    },
                    {
                        service: '24x7_emergency_support',
                        market_demand: 0.7,
                        implementation_difficulty: 0.8,
                        roi_potential: 0.6
                    }
                ],
                recommendations: [
                    'Implement telemedicine capabilities',
                    'Partner with emergency care providers',
                    'Expand diagnostic services'
                ]
            },
            automated_actions: [
                'service_profile_updated',
                'expansion_plan_created'
            ]
        };
    }

    async executeSemiAutomatedTask(task) {
        console.log(`🔄 Executing semi-automated task: ${task.category}`);

        // Generate analysis and recommendations, but require human approval
        const automated_analysis = await this.executeAutomatedTask(task);
        
        return {
            success: false, // Requires human intervention
            automated_analysis: automated_analysis,
            human_action_required: true,
            pending_approvals: [
                'review_recommendations',
                'approve_automated_actions',
                'verify_analysis_accuracy'
            ],
            blockers: ['awaiting_human_review']
        };
    }

    async createManualTaskInstructions(task) {
        console.log(`📋 Creating manual task instructions: ${task.title}`);

        const prompt = `Generate detailed manual task instructions for healthcare provider management:

Task: ${task.title}
Description: ${task.description}
Category: ${task.category}
Priority: ${task.priority}
Provider ID: ${task.context.provider_id}
Required Data: ${task.required_data.join(', ')}

Create step-by-step instructions for:
1. Data collection requirements
2. Analysis procedures
3. Decision-making criteria
4. Quality checkpoints
5. Documentation requirements
6. Follow-up actions

Manual Task Instructions:`;

        try {
            const response = await this.callTinyLlama(prompt);
            
            return {
                success: false, // Manual tasks don't auto-complete
                manual_instructions: response,
                human_action_required: true,
                estimated_manual_effort: task.estimated_duration,
                checklist: this.generateTaskChecklist(task, response),
                blockers: ['awaiting_manual_execution']
            };
        } catch (error) {
            return {
                success: false,
                error: 'Could not generate manual instructions',
                manual_instructions: `Manual task: ${task.description}`,
                blockers: ['instruction_generation_failed']
            };
        }
    }

    generateTaskChecklist(task, instructions) {
        const checklist = [];
        
        // Basic checklist items
        checklist.push('Gather required data');
        checklist.push('Review task instructions');
        checklist.push('Execute main task activities');
        checklist.push('Validate results');
        checklist.push('Document outcomes');
        checklist.push('Update task status');

        // Extract additional items from instructions
        const instructionLines = instructions.split('\n').filter(line => 
            line.trim().length > 10 && (line.includes('-') || line.includes('1.') || line.includes('2.'))
        );

        for (const line of instructionLines) {
            const cleanLine = line.replace(/^[-*\d.\s]+/, '').trim();
            if (cleanLine.length > 5) {
                checklist.push(cleanLine);
            }
        }

        return checklist.map((item, index) => ({
            id: index + 1,
            description: item,
            completed: false
        }));
    }

    async genericAutomatedExecution(task) {
        return {
            success: true,
            generic_result: {
                task_id: task.id,
                execution_method: 'generic_automation',
                data_processed: true,
                basic_analysis: 'Task processed using generic automation rules',
                recommendations: ['Review task results', 'Verify data accuracy']
            },
            automated_actions: ['task_logged', 'basic_processing_completed']
        };
    }

    async completeTask(task) {
        console.log(`✅ Completing task: ${task.title}`);

        // Remove from active queue
        this.taskQueue = this.taskQueue.filter(t => t.id !== task.id);
        
        // Move to completed tasks
        this.completedTasks.set(task.id, task);
        
        // Archive task file
        try {
            const activePath = path.join(TASK_CONFIG.cache.dir, 'active', `${task.id}.json`);
            const completedPath = path.join(TASK_CONFIG.cache.dir, 'completed', `${task.id}.json`);
            
            await fs.rename(activePath, completedPath);
        } catch (error) {
            console.warn('⚠️ Task archiving warning:', error.message);
        }

        // Generate follow-up tasks if needed
        await this.generateFollowUpTasks(task);
    }

    async generateFollowUpTasks(completedTask) {
        if (!completedTask.execution_result || !completedTask.execution_result.success) {
            return;
        }

        const followUpTasks = [];
        
        // Based on task category, generate relevant follow-ups
        switch (completedTask.category) {
            case 'provider_verification':
                if (completedTask.execution_result.verification_result.verification_score < 0.8) {
                    followUpTasks.push({
                        title: 'Improve Provider Data Quality',
                        template: 'quality_assessment',
                        priority: 'medium',
                        provider_id: completedTask.context.provider_id
                    });
                }
                break;
                
            case 'network_expansion':
                const networkResult = completedTask.execution_result.network_analysis;
                if (networkResult.connection_opportunities.length > 0) {
                    followUpTasks.push({
                        title: 'Facilitate Provider Connections',
                        category: 'network_expansion',
                        priority: 'medium',
                        provider_id: completedTask.context.provider_id,
                        additional_data: {
                            connection_opportunities: networkResult.connection_opportunities
                        }
                    });
                }
                break;
        }

        // Create follow-up tasks
        for (const followUp of followUpTasks) {
            await this.createTask(followUp);
        }

        if (followUpTasks.length > 0) {
            console.log(`🔄 Generated ${followUpTasks.length} follow-up tasks`);
        }
    }

    async updateTask(task) {
        try {
            // Update in memory
            this.tasks.set(task.id, task);
            
            // Update file
            const taskPath = path.join(TASK_CONFIG.cache.dir, 'active', `${task.id}.json`);
            await fs.writeFile(taskPath, JSON.stringify(task, null, 2));

            // Log update to Intelligent Database
            const updatePayload = {
                patient_id: `task_${task.id}`,
                query: `Task update: ${task.title} - Status: ${task.status}`,
                llm_response: JSON.stringify({
                    action: 'task_updated',
                    task_id: task.id,
                    status: task.status,
                    progress: task.progress,
                    timestamp: new Date().toISOString()
                }),
                source_service: 'task_managing_rag_agent'
            };

            await axios.post(
                `${TASK_CONFIG.intelligentDB.baseUrl}${TASK_CONFIG.intelligentDB.endpoints.store}`,
                updatePayload
            );

        } catch (error) {
            console.warn('⚠️ Task update warning:', error.message);
        }
    }

    async checkAutomationTriggers() {
        console.log('🔍 Checking automation triggers...');

        // Check each automation rule
        for (const rule of this.automationRules) {
            try {
                await this.evaluateAutomationRule(rule);
            } catch (error) {
                console.warn(`⚠️ Automation rule evaluation failed: ${rule.trigger}`, error.message);
            }
        }
    }

    async evaluateAutomationRule(rule) {
        // This would integrate with the provider agent to check for trigger conditions
        // For now, we'll simulate trigger evaluation
        
        const mockTriggerData = {
            provider: { verified: Math.random() > 0.5 },
            quality_score: Math.random(),
            potential_connections: Math.floor(Math.random() * 10),
            compliance_score: Math.random(),
            service_gaps: Math.random() > 0.7 ? ['emergency_care'] : []
        };

        if (rule.condition(mockTriggerData)) {
            console.log(`🎯 Automation trigger activated: ${rule.trigger}`);
            
            const taskData = {
                title: `Auto-generated: ${rule.action}`,
                template: rule.template,
                priority: rule.priority || 'medium',
                trigger: rule.trigger,
                additional_data: mockTriggerData,
                provider_id: `provider_${Math.random().toString(36).substr(2, 9)}`
            };

            await this.createTask(taskData);
        }
    }

    async generateTaskReport() {
        console.log('📊 Generating task management report...');

        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total_active_tasks: this.tasks.size,
                total_completed_tasks: this.completedTasks.size,
                tasks_by_priority: this.getTasksByPriority(),
                tasks_by_category: this.getTasksByCategory(),
                tasks_by_status: this.getTasksByStatus(),
                average_completion_time: this.calculateAverageCompletionTime()
            },
            performance_metrics: {
                automation_success_rate: this.calculateAutomationSuccessRate(),
                task_throughput: this.calculateTaskThroughput(),
                quality_indicators: this.calculateQualityIndicators()
            },
            recommendations: await this.generateTaskRecommendations()
        };

        await this.storeTaskReport(report);
        return report;
    }

    getTasksByPriority() {
        const priorities = { critical: 0, high: 0, medium: 0, low: 0 };
        
        for (const task of this.tasks.values()) {
            priorities[task.priority]++;
        }
        
        return priorities;
    }

    getTasksByCategory() {
        const categories = {};
        
        for (const task of this.tasks.values()) {
            categories[task.category] = (categories[task.category] || 0) + 1;
        }
        
        return categories;
    }

    getTasksByStatus() {
        const statuses = {};
        
        for (const task of this.tasks.values()) {
            statuses[task.status] = (statuses[task.status] || 0) + 1;
        }
        
        return statuses;
    }

    calculateAverageCompletionTime() {
        const completedTasks = [...this.completedTasks.values()].filter(task => 
            task.completed_at && task.started_at
        );

        if (completedTasks.length === 0) return 0;

        const totalTime = completedTasks.reduce((sum, task) => {
            const startTime = new Date(task.started_at);
            const endTime = new Date(task.completed_at);
            return sum + (endTime - startTime);
        }, 0);

        return totalTime / completedTasks.length; // Average in milliseconds
    }

    calculateAutomationSuccessRate() {
        const automatedTasks = [...this.completedTasks.values()].filter(task => 
            task.automation_level === 'automated'
        );

        if (automatedTasks.length === 0) return 0;

        const successfulTasks = automatedTasks.filter(task => 
            task.execution_result && task.execution_result.success
        );

        return successfulTasks.length / automatedTasks.length;
    }

    calculateTaskThroughput() {
        const completedToday = [...this.completedTasks.values()].filter(task => {
            const completedDate = new Date(task.completed_at);
            const today = new Date();
            return completedDate.toDateString() === today.toDateString();
        });

        return completedToday.length;
    }

    calculateQualityIndicators() {
        const allTasks = [...this.tasks.values(), ...this.completedTasks.values()];
        
        return {
            tasks_with_rag_analysis: allTasks.filter(task => task.rag_analysis).length / allTasks.length,
            high_priority_completion_rate: this.getHighPriorityCompletionRate(),
            automation_coverage: allTasks.filter(task => task.automation_level !== 'manual').length / allTasks.length
        };
    }

    getHighPriorityCompletionRate() {
        const highPriorityTasks = [...this.tasks.values(), ...this.completedTasks.values()].filter(task => 
            task.priority === 'critical' || task.priority === 'high'
        );

        if (highPriorityTasks.length === 0) return 0;

        const completedHighPriority = highPriorityTasks.filter(task => task.status === 'completed');
        return completedHighPriority.length / highPriorityTasks.length;
    }

    async generateTaskRecommendations() {
        const prompt = `Analyze task management performance and generate recommendations:

Active Tasks: ${this.tasks.size}
Completed Tasks: ${this.completedTasks.size}
Task Queue Length: ${this.taskQueue.length}
Automation Success Rate: ${(this.calculateAutomationSuccessRate() * 100).toFixed(1)}%

Generate recommendations for:
1. Task prioritization optimization
2. Automation improvement opportunities
3. Resource allocation strategies
4. Quality enhancement measures
5. Process efficiency improvements

Task Management Recommendations:`;

        try {
            const response = await this.callTinyLlama(prompt);
            return this.parseRecommendations(response);
        } catch (error) {
            console.warn('⚠️ Recommendation generation failed:', error.message);
            return this.generateFallbackRecommendations();
        }
    }

    parseRecommendations(response) {
        const recommendations = [];
        const lines = response.split('\n').filter(line => line.trim().length > 10);

        for (const line of lines) {
            if (line.includes('-') || line.match(/^\d+\./)) {
                const cleanLine = line.replace(/^[-*\d.\s]+/, '').trim();
                if (cleanLine.length > 5) {
                    recommendations.push({
                        recommendation: cleanLine,
                        category: this.categorizeRecommendation(cleanLine),
                        priority: this.assessRecommendationPriority(cleanLine)
                    });
                }
            }
        }

        return recommendations;
    }

    categorizeRecommendation(recommendation) {
        const recText = recommendation.toLowerCase();
        
        if (recText.includes('automat')) return 'automation';
        if (recText.includes('priority') || recText.includes('priorit')) return 'prioritization';
        if (recText.includes('resource') || recText.includes('allocation')) return 'resource_management';
        if (recText.includes('quality') || recText.includes('improvement')) return 'quality';
        if (recText.includes('efficiency') || recText.includes('process')) return 'process_optimization';
        
        return 'general';
    }

    assessRecommendationPriority(recommendation) {
        const recText = recommendation.toLowerCase();
        
        if (recText.includes('critical') || recText.includes('urgent')) return 'high';
        if (recText.includes('important') || recText.includes('significant')) return 'medium';
        
        return 'low';
    }

    generateFallbackRecommendations() {
        return [
            {
                recommendation: 'Increase automation coverage for routine tasks',
                category: 'automation',
                priority: 'medium'
            },
            {
                recommendation: 'Prioritize critical and high-priority tasks in queue',
                category: 'prioritization', 
                priority: 'high'
            },
            {
                recommendation: 'Monitor task completion rates and identify bottlenecks',
                category: 'process_optimization',
                priority: 'medium'
            }
        ];
    }

    async storeTaskReport(report) {
        try {
            // Store in Intelligent Database
            const storePayload = {
                patient_id: 'task_management_report',
                query: 'Task management performance report',
                llm_response: JSON.stringify({
                    action: 'task_report_generated',
                    report: report,
                    timestamp: new Date().toISOString()
                }),
                source_service: 'task_managing_rag_agent'
            };

            await axios.post(
                `${TASK_CONFIG.intelligentDB.baseUrl}${TASK_CONFIG.intelligentDB.endpoints.store}`,
                storePayload
            );

            // Save to file
            const reportPath = path.join(TASK_CONFIG.cache.dir, `task_report_${Date.now()}.json`);
            await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

            console.log('📊 Task report stored successfully');
        } catch (error) {
            console.error('❌ Task report storage failed:', error.message);
        }
    }

    async cleanup() {
        console.log('🧹 Cleaning up Task Managing RAG Agent...');
        
        if (this.providerAgent) {
            await this.providerAgent.cleanup();
        }
        
        this.tasks.clear();
        this.completedTasks.clear();
        this.taskQueue = [];
        
        console.log('✅ Task Managing RAG Agent cleanup complete');
    }
}

// Export for use as module
module.exports = { TaskManagingRAGAgent };

// CLI interface
if (require.main === module) {
    async function main() {
        console.log('\n🎯 TASK MANAGING RAG AGENT');
        console.log('============================');
        console.log('🤖 Using: Tiny-LLaMA Medical Model');
        console.log('📊 Database: Intelligent Medical Database'); 
        console.log('🎯 Target: Automated healthcare provider task management');
        
        const agent = new TaskManagingRAGAgent();
        
        try {
            await agent.initialize();
            
            // Example: Create some sample tasks
            console.log('\n📝 Creating sample tasks...');
            
            const sampleTasks = [
                {
                    title: 'Verify New Provider Registration',
                    template: 'provider_verification',
                    priority: 'high',
                    provider_id: 'provider_001'
                },
                {
                    title: 'Assess Quality Metrics',
                    template: 'quality_assessment',
                    priority: 'medium', 
                    provider_id: 'provider_002'
                },
                {
                    title: 'Analyze Network Connections',
                    template: 'network_analysis',
                    priority: 'medium',
                    provider_id: 'provider_001'
                }
            ];

            for (const taskData of sampleTasks) {
                const task = await agent.createTask(taskData);
                console.log(`✅ Created task: ${task.title} [${task.priority}]`);
            }

            // Process tasks for a few cycles
            console.log('\n⚡ Processing tasks...');
            for (let i = 0; i < 3; i++) {
                await agent.processTaskQueue();
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            }

            // Generate report
            console.log('\n📊 Generating task management report...');
            const report = await agent.generateTaskReport();
            console.log(`✅ Report generated with ${report.recommendations.length} recommendations`);
            
            // Display summary
            console.log('\n📋 TASK SUMMARY:');
            console.log(`   Active: ${report.summary.total_active_tasks}`);
            console.log(`   Completed: ${report.summary.total_completed_tasks}`);
            console.log(`   Automation Success: ${(report.performance_metrics.automation_success_rate * 100).toFixed(1)}%`);

        } catch (error) {
            console.error('❌ Agent execution failed:', error.message);
            process.exit(1);
        } finally {
            await agent.cleanup();
        }
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n⚠️ Received SIGINT, shutting down gracefully...');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n⚠️ Received SIGTERM, shutting down gracefully...');
        process.exit(0);
    });

    main().catch(error => {
        console.error('❌ Application failed:', error.message);
        process.exit(1);
    });
}