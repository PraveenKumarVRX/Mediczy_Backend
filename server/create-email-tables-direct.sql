-- Create email_settings table
CREATE TABLE IF NOT EXISTS email_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" INTEGER NOT NULL,
    email VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(255),
    provider VARCHAR(50) DEFAULT 'custom',
    -- SMTP Configuration
    "smtpHost" VARCHAR(255),
    "smtpPort" INTEGER DEFAULT 587,
    "smtpSecure" BOOLEAN DEFAULT false,
    "smtpUsername" VARCHAR(255),
    "smtpPassword" VARCHAR(255),
    -- IMAP Configuration  
    "imapHost" VARCHAR(255),
    "imapPort" INTEGER DEFAULT 993,
    "imapSecure" BOOLEAN DEFAULT true,
    "imapUsername" VARCHAR(255),
    "imapPassword" VARCHAR(255),
    -- Status
    "isActive" BOOLEAN DEFAULT true,
    "isDefault" BOOLEAN DEFAULT false,
    "isVerified" BOOLEAN DEFAULT false,
    "lastTestedAt" TIMESTAMP WITH TIME ZONE,
    "lastSyncedAt" TIMESTAMP WITH TIME ZONE,
    -- Rate Limiting
    "rateLimitPerHour" INTEGER DEFAULT 100,
    "rateLimitPerDay" INTEGER DEFAULT 1000,
    -- Sync Settings
    "syncEnabled" BOOLEAN DEFAULT true,
    "syncFrequencyMinutes" INTEGER DEFAULT 15,
    "syncFolders" TEXT,
    -- Metadata
    notes TEXT,
    "deletedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Create email_inboxes table
CREATE TABLE IF NOT EXISTS email_inboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "teamMemberId" INTEGER NOT NULL,
    "emailId" VARCHAR(255),
    "messageId" VARCHAR(255) UNIQUE,
    "threadId" VARCHAR(255),
    -- Email Headers
    "from" VARCHAR(500),
    "fromName" VARCHAR(255),
    "to" TEXT,
    "cc" TEXT,
    "bcc" TEXT,
    "replyTo" VARCHAR(500),
    subject TEXT,
    -- Content
    "textContent" TEXT,
    "htmlContent" TEXT,
    snippet VARCHAR(500),
    -- Metadata
    "receivedAt" TIMESTAMP WITH TIME ZONE,
    "sentAt" TIMESTAMP WITH TIME ZONE,
    "hasAttachments" BOOLEAN DEFAULT false,
    "attachmentCount" INTEGER DEFAULT 0,
    attachments JSONB,
    -- Organization
    folder VARCHAR(100) DEFAULT 'INBOX',
    labels TEXT [],
    "isRead" BOOLEAN DEFAULT false,
    "isStarred" BOOLEAN DEFAULT false,
    "isArchived" BOOLEAN DEFAULT false,
    "isTrashed" BOOLEAN DEFAULT false,
    "isSpam" BOOLEAN DEFAULT false,
    -- AI Analysis
    "aiProcessed" BOOLEAN DEFAULT false,
    "aiProcessedAt" TIMESTAMP WITH TIME ZONE,
    "aiIntent" VARCHAR(100),
    "aiSentiment" VARCHAR(50),
    "aiPriority" VARCHAR(50),
    "aiSummary" TEXT,
    "aiKeyPoints" JSONB,
    "aiRequiresAction" BOOLEAN DEFAULT false,
    "aiSuggestedActions" JSONB,
    "aiCategory" VARCHAR(100),
    "aiTags" TEXT [],
    -- Patient/Appointment Detection
    "patientName" VARCHAR(255),
    "patientId" INTEGER,
    "appointmentDate" TIMESTAMP WITH TIME ZONE,
    "appointmentId" INTEGER,
    -- References
    "emailSettingsId" UUID,
    "rawHeaders" JSONB,
    "rawData" JSONB,
    -- Timestamps
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_settings_userId ON email_settings("userId");
CREATE INDEX IF NOT EXISTS idx_email_settings_email ON email_settings(email);
CREATE INDEX IF NOT EXISTS idx_email_settings_active ON email_settings("isActive");
CREATE INDEX IF NOT EXISTS idx_email_inboxes_team ON email_inboxes("teamMemberId");
CREATE INDEX IF NOT EXISTS idx_email_inboxes_messageId ON email_inboxes("messageId");
CREATE INDEX IF NOT EXISTS idx_email_inboxes_received ON email_inboxes("receivedAt");
CREATE INDEX IF NOT EXISTS idx_email_inboxes_read ON email_inboxes("isRead");
CREATE INDEX IF NOT EXISTS idx_email_inboxes_starred ON email_inboxes("isStarred");
CREATE INDEX IF NOT EXISTS idx_email_inboxes_intent ON email_inboxes("aiIntent");
CREATE INDEX IF NOT EXISTS idx_email_inboxes_sentiment ON email_inboxes("aiSentiment");
-- Success message
SELECT 'Email tables created successfully!' AS result;