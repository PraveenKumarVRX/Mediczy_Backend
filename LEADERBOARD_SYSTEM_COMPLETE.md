# Leaderboard System - Complete Documentation

## Overview
The Leaderboard System enables competitive health gamification with goals, challenges, peer rankings, and achievements to motivate users towards better health outcomes.

## Features
- ✅ Health Goals (Personal, Group, Corporate)
- ✅ Time-bound Challenges with prizes
- ✅ Multiple leaderboard types (Global, Peers, Corporate)
- ✅ Achievement badges with rewards
- ✅ Streak tracking
- ✅ Points system
- ✅ Health coins integration

---

## Database Tables

### 1. health_goals
Stores available health goals for users to pursue.

**Fields:**
- `id`: Primary key
- `name`: Goal name (e.g., "10,000 Steps Daily")
- `description`: Detailed description
- `category`: ENUM (FITNESS, NUTRITION, WEIGHT, MENTAL_HEALTH, SLEEP, HYDRATION, STEPS, EXERCISE, MEDITATION, SCREENING, MEDICATION, QUIT_SMOKING, CUSTOM)
- `type`: ENUM (PERSONAL, GROUP, CORPORATE)
- `targetType`: ENUM (COUNT, DURATION, DISTANCE, WEIGHT, BOOLEAN, PERCENTAGE)
- `targetValue`: Numeric target to achieve
- `targetUnit`: Unit of measurement (steps, kg, minutes, etc.)
- `duration`: Days to complete goal
- `points`: Points awarded on completion
- `difficulty`: ENUM (EASY, MEDIUM, HARD, EXPERT)
- `createdBy`: User who created (NULL for system goals)
- `corporateId`: Corporate sponsor (if applicable)
- `isPublic`: Visible to all users
- `isActive`: Currently available
- `icon`: Emoji or icon identifier
- `color`: Display color
- `milestones`: JSONB - Intermediate checkpoints

### 2. user_goal_progress
Tracks individual user progress on goals.

**Fields:**
- `id`: Primary key
- `userId`: Reference to users table
- `goalId`: Reference to health_goals table
- `status`: ENUM (NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED, ABANDONED)
- `currentValue`: Current progress value
- `targetValue`: Target value (copied from goal)
- `progressPercentage`: 0-100%
- `startDate`: When user joined goal
- `endDate`: Target completion date
- `completedAt`: Actual completion timestamp
- `pointsEarned`: Points awarded
- `streak`: Consecutive days of activity
- `lastActivityDate`: Last progress update
- `checkIns`: JSONB - Array of daily check-ins
- `notes`: User notes
- `isShared`: Share with friends/group
- `metadata`: Additional data

### 3. health_challenges
Time-bound competitions with multiple participants.

**Fields:**
- `id`: Primary key
- `name`: Challenge name
- `description`: Details
- `category`: Same as goals
- `type`: ENUM (OPEN, PRIVATE, CORPORATE, FRIENDS)
- `goalType`: ENUM (INDIVIDUAL, TEAM, CUMULATIVE)
- `targetType`: Measurement type
- `targetValue`: Target to achieve
- `startDate`: Challenge start
- `endDate`: Challenge end
- `points`: Points for completion
- `bonusPoints`: Extra points for winners
- `difficulty`: Challenge difficulty
- `maxParticipants`: Maximum participants (NULL = unlimited)
- `minParticipants`: Minimum to start
- `status`: ENUM (UPCOMING, ACTIVE, COMPLETED, CANCELLED)
- `isRecurring`: Repeats automatically
- `recurringPattern`: ENUM (DAILY, WEEKLY, MONTHLY, CUSTOM)
- `createdBy`: Challenge creator
- `corporateId`: Corporate sponsor
- `imageUrl`: Challenge banner
- `badgeIcon`: Achievement badge
- `entryFee`: Health coins to join
- `prizePool`: Total prize in coins
- `prizeDistribution`: JSONB - Prize split (1st: 50%, 2nd: 30%, etc.)
- `rules`: JSONB - Custom rules
- `leaderboardConfig`: JSONB - Display settings

### 4. user_challenge_participation
Tracks user participation in challenges.

**Fields:**
- `id`: Primary key
- `userId`: Participant
- `challengeId`: Challenge reference
- `teamId`: Team (for team challenges)
- `status`: ENUM (REGISTERED, ACTIVE, COMPLETED, WITHDRAWN, DISQUALIFIED)
- `currentValue`: Current progress
- `progressPercentage`: 0-100%
- `rank`: Current rank in leaderboard
- `previousRank`: Previous rank (for trend)
- `pointsEarned`: Base points
- `bonusPointsEarned`: Bonus points
- `joinedAt`: Join timestamp
- `completedAt`: Completion timestamp
- `lastActivityDate`: Last update
- `checkIns`: JSONB - Progress updates
- `achievements`: JSONB - Milestones reached
- `isWinner`: Won prize
- `prizeWon`: Coins won
- `entryFeePaid`: Coins paid to enter
- `notes`: User notes

### 5. leaderboards
Aggregate rankings across different dimensions.

**Fields:**
- `id`: Primary key
- `userId`: User being ranked
- `leaderboardType`: ENUM (GLOBAL, FRIENDS, CORPORATE, CHALLENGE, GOAL_CATEGORY)
- `referenceId`: Challenge/Corporate/Category ID
- `period`: ENUM (DAILY, WEEKLY, MONTHLY, YEARLY, ALL_TIME)
- `periodStart`: Period start date
- `periodEnd`: Period end date
- `rank`: Current rank
- `previousRank`: Previous rank
- `totalPoints`: Cumulative points
- `goalsCompleted`: Count of completed goals
- `challengesWon`: Count of won challenges
- `currentStreak`: Current consecutive days
- `longestStreak`: Best streak record
- `achievements`: JSONB - Achievement IDs
- `stats`: JSONB - Detailed statistics
- `lastUpdated`: Last recalculation

### 6. achievements
Achievement badges users can unlock.

**Fields:**
- `id`: Primary key
- `name`: Achievement name
- `description`: How to unlock
- `category`: ENUM (GOALS, CHALLENGES, STREAKS, SOCIAL, MILESTONES, CONSISTENCY, CHAMPION, SPECIAL)
- `badgeIcon`: Icon identifier
- `badgeColor`: Display color
- `tier`: ENUM (BRONZE, SILVER, GOLD, PLATINUM, DIAMOND)
- `points`: Points awarded
- `coinReward`: Health coins reward
- `criteria`: JSONB - Unlock conditions
- `isActive`: Currently available
- `isSecret`: Hidden until unlocked
- `unlockOrder`: Sequential achievement
- `metadata`: Additional data

### 7. user_achievements
User's unlocked achievements.

**Fields:**
- `id`: Primary key
- `userId`: User reference
- `achievementId`: Achievement reference
- `unlockedAt`: Unlock timestamp
- `progress`: 0-100% (100 = unlocked)
- `isNotified`: User notified
- `isDisplayed`: Show on profile

---

## Seeded Data

### Default Health Goals (8)
1. **10,000 Steps Daily** - STEPS, 30 days, 100 points, MEDIUM
2. **Drink 8 Glasses of Water** - HYDRATION, 30 days, 50 points, EASY
3. **Lose 5kg in 3 Months** - WEIGHT, 90 days, 300 points, HARD
4. **30 Minutes Daily Exercise** - EXERCISE, 30 days, 120 points, MEDIUM
5. **7 Hours Sleep Daily** - SLEEP, 30 days, 90 points, MEDIUM
6. **10 Minutes Daily Meditation** - MEDITATION, 30 days, 80 points, EASY
7. **Run 5K** - FITNESS, 60 days, 200 points, HARD
8. **Quit Smoking - 30 Days** - QUIT_SMOKING, 30 days, 500 points, EXPERT

### Default Achievements (10)
1. **First Steps** - Complete 1 goal, 50 points, 100 coins, BRONZE
2. **Goal Master** - Complete 10 goals, 500 points, 1000 coins, GOLD
3. **Challenger** - Join 1 challenge, 100 points, 200 coins, BRONZE
4. **Champion** - Win 5 challenges, 1000 points, 2000 coins, GOLD
5. **Week Warrior** - 7-day streak, 100 points, 150 coins, BRONZE
6. **Unstoppable** - 30-day streak, 500 points, 1000 coins, GOLD
7. **Social Butterfly** - Complete group challenge, 150 points, 250 coins, BRONZE
8. **Consistency King** - 30 consecutive logs, 300 points, 500 coins, SILVER
9. **Milestone Maker** - Reach 100K points, 2000 points, 5000 coins, PLATINUM
10. **Legend** - Unlock all achievements, 10000 points, 20000 coins, DIAMOND (SECRET)

---

## API Endpoints

### Health Goals

#### GET /api/leaderboard/goals
Get all available goals.

**Query Parameters:**
- `category` (optional): Filter by category
- `type` (optional): PERSONAL, GROUP, CORPORATE
- `difficulty` (optional): EASY, MEDIUM, HARD, EXPERT
- `isPublic` (optional): true/false

**Response:**
```json
{
  "success": true,
  "data": {
    "goals": [
      {
        "id": 1,
        "name": "10,000 Steps Daily",
        "description": "Walk 10,000 steps every day...",
        "category": "STEPS",
        "type": "PERSONAL",
        "targetType": "COUNT",
        "targetValue": 10000,
        "targetUnit": "steps",
        "duration": 30,
        "points": 100,
        "difficulty": "MEDIUM",
        "icon": "🚶",
        "color": "#4CAF50"
      }
    ]
  }
}
```

#### GET /api/leaderboard/goals/:goalId
Get goal details.

#### POST /api/leaderboard/goals
Create custom goal.

**Request Body:**
```json
{
  "name": "Custom Yoga Goal",
  "description": "Practice yoga daily",
  "category": "EXERCISE",
  "type": "PERSONAL",
  "targetType": "COUNT",
  "targetValue": 30,
  "targetUnit": "sessions",
  "duration": 30,
  "points": 150,
  "difficulty": "MEDIUM",
  "icon": "🧘",
  "color": "#9C27B0"
}
```

#### POST /api/leaderboard/goals/:goalId/join
Join a goal.

**Response:**
```json
{
  "success": true,
  "message": "Successfully joined goal",
  "data": {
    "progress": {
      "id": 1,
      "userId": 123,
      "goalId": 1,
      "status": "IN_PROGRESS",
      "currentValue": 0,
      "targetValue": 10000,
      "progressPercentage": 0,
      "startDate": "2025-01-15T10:00:00Z",
      "endDate": "2025-02-14T10:00:00Z"
    }
  }
}
```

#### POST /api/leaderboard/goals/:goalId/progress
Update goal progress.

**Request Body:**
```json
{
  "incrementBy": 5000,
  "note": "Morning walk"
}
```
OR
```json
{
  "value": 5000,
  "note": "Today's steps"
}
```

#### GET /api/leaderboard/my-goals
Get user's active goals.

**Query Parameters:**
- `status` (optional): NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED, ABANDONED

---

### Challenges

#### GET /api/leaderboard/challenges
Get all challenges.

**Query Parameters:**
- `status`: UPCOMING, ACTIVE, COMPLETED, CANCELLED
- `type`: OPEN, PRIVATE, CORPORATE, FRIENDS
- `category`: Same as goals

#### GET /api/leaderboard/challenges/:challengeId
Get challenge details with participants.

#### POST /api/leaderboard/challenges
Create challenge.

**Request Body:**
```json
{
  "name": "January Step Challenge",
  "description": "Walk 300,000 steps in January",
  "category": "STEPS",
  "type": "OPEN",
  "goalType": "INDIVIDUAL",
  "targetType": "COUNT",
  "targetValue": 300000,
  "targetUnit": "steps",
  "startDate": "2025-01-01T00:00:00Z",
  "endDate": "2025-01-31T23:59:59Z",
  "points": 500,
  "bonusPoints": 200,
  "difficulty": "HARD",
  "maxParticipants": 100,
  "entryFee": 50,
  "prizePool": 5000,
  "prizeDistribution": {
    "1": 50,
    "2": 30,
    "3": 20
  }
}
```

#### POST /api/leaderboard/challenges/:challengeId/join
Join a challenge.

**Response:**
```json
{
  "success": true,
  "message": "Successfully joined challenge",
  "data": {
    "participation": {
      "id": 1,
      "userId": 123,
      "challengeId": 5,
      "status": "ACTIVE",
      "currentValue": 0,
      "rank": null,
      "entryFeePaid": 50
    }
  }
}
```

#### POST /api/leaderboard/challenges/:challengeId/progress
Update challenge progress.

**Request Body:**
```json
{
  "incrementBy": 10000,
  "note": "Week 1 progress"
}
```

#### GET /api/leaderboard/challenges/:challengeId/leaderboard
Get challenge rankings.

**Query Parameters:**
- `limit` (default: 50): Number of participants to return

**Response:**
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "id": 1,
        "userId": 123,
        "rank": 1,
        "currentValue": 150000,
        "progressPercentage": 50,
        "pointsEarned": 500,
        "user": {
          "id": 123,
          "name": "John Doe",
          "profilePicture": "https://..."
        }
      }
    ]
  }
}
```

---

### Leaderboards

#### GET /api/leaderboard/leaderboard/global
Get global leaderboard.

**Query Parameters:**
- `period` (default: ALL_TIME): DAILY, WEEKLY, MONTHLY, YEARLY, ALL_TIME
- `limit` (default: 50): Number of ranks to return

**Response:**
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "id": 1,
        "userId": 123,
        "rank": 1,
        "previousRank": 2,
        "totalPoints": 5000,
        "goalsCompleted": 15,
        "challengesWon": 3,
        "currentStreak": 25,
        "user": {
          "id": 123,
          "name": "John Doe",
          "email": "john@example.com",
          "profilePicture": "https://..."
        }
      }
    ],
    "period": "ALL_TIME"
  }
}
```

#### GET /api/leaderboard/leaderboard/peers
Get peer leaderboard (nearby ranks).

**Query Parameters:**
- `limit` (default: 20): Number of peers to show

#### GET /api/leaderboard/leaderboard/corporate/:corporateId
Get corporate leaderboard.

**Query Parameters:**
- `period` (default: MONTHLY)
- `limit` (default: 50)

#### GET /api/leaderboard/leaderboard/my-rank
Get user's current rank.

**Query Parameters:**
- `type` (default: GLOBAL): GLOBAL, FRIENDS, CORPORATE, CHALLENGE, GOAL_CATEGORY
- `period` (default: ALL_TIME)

**Response:**
```json
{
  "success": true,
  "data": {
    "rank": {
      "rank": 42,
      "previousRank": 45,
      "totalPoints": 2500,
      "goalsCompleted": 8,
      "challengesWon": 2,
      "currentStreak": 12,
      "longestStreak": 20
    }
  }
}
```

#### GET /api/leaderboard/stats/summary
Get user's complete stats.

**Response:**
```json
{
  "success": true,
  "data": {
    "stats": {
      "goalsCompleted": 8,
      "challengesWon": 2,
      "challengesParticipated": 5,
      "totalPoints": 2500,
      "currentStreak": 12
    }
  }
}
```

---

### Achievements

#### GET /api/leaderboard/achievements
Get all achievements.

**Query Parameters:**
- `includeSecret` (default: false): Show secret achievements

#### GET /api/leaderboard/achievements/my
Get user's unlocked achievements.

**Response:**
```json
{
  "success": true,
  "data": {
    "achievements": [
      {
        "id": 1,
        "userId": 123,
        "achievementId": 1,
        "unlockedAt": "2025-01-10T14:30:00Z",
        "progress": 100,
        "achievement": {
          "id": 1,
          "name": "First Steps",
          "description": "Complete your first health goal",
          "category": "GOALS",
          "badgeIcon": "🎯",
          "badgeColor": "#4CAF50",
          "tier": "BRONZE",
          "points": 50,
          "coinReward": 100
        }
      }
    ]
  }
}
```

---

## Integration Guide

### On User Login
Display leaderboard widget on dashboard:

```javascript
// Fetch user's rank
const rankResponse = await fetch('/api/leaderboard/leaderboard/my-rank', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { rank } = await rankResponse.json();

// Fetch peer leaderboard
const peersResponse = await fetch('/api/leaderboard/leaderboard/peers?limit=10', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { leaderboard } = await peersResponse.json();

// Fetch active goals
const goalsResponse = await fetch('/api/leaderboard/my-goals?status=IN_PROGRESS', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { goals } = await goalsResponse.json();

// Fetch recent achievements
const achievementsResponse = await fetch('/api/leaderboard/achievements/my', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { achievements } = await achievementsResponse.json();
```

### Joining a Goal
```javascript
const response = await fetch(`/api/leaderboard/goals/${goalId}/join`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### Updating Progress
```javascript
const response = await fetch(`/api/leaderboard/goals/${goalId}/progress`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    incrementBy: 5000, // Add 5000 steps
    note: 'Morning workout'
  })
});
```

### Joining a Challenge
```javascript
const response = await fetch(`/api/leaderboard/challenges/${challengeId}/join`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
// Entry fee will be automatically deducted from wallet
```

---

## Business Logic

### Goal Completion
When a user reaches 100% progress:
1. Status updated to COMPLETED
2. Points awarded to user
3. Health coins credited to wallet
4. Leaderboard updated with new stats
5. Achievements checked and unlocked
6. Notification sent to user

### Challenge Finalization
When challenge ends:
1. Final rankings calculated
2. Prizes distributed based on prize distribution (e.g., 1st: 50%, 2nd: 30%, 3rd: 20%)
3. Winners marked and bonus points awarded
4. Health coins credited to winners
5. Challenge status set to COMPLETED
6. Notifications sent to all participants

### Leaderboard Ranking
Rankings calculated based on:
1. Total points (primary)
2. Goals completed (secondary)
3. Challenges won (tertiary)
4. Last updated (tiebreaker)

### Achievement Unlocking
Automatically triggered on:
- Goal completion
- Challenge participation/win
- Streak milestones
- Point milestones

### Streak Calculation
- Increments when user logs activity on consecutive days
- Resets if a day is missed
- Longest streak saved separately

---

## Frontend Integration

### Login Dashboard Widget
```jsx
<LeaderboardWidget>
  <UserRank rank={42} trend="up" />
  <PeerList peers={topPeers} />
  <ActiveGoals goals={userGoals} />
  <RecentAchievements achievements={latest} />
  <ChallengeInvites invites={pending} />
</LeaderboardWidget>
```

### Goal Selection Screen
```jsx
<GoalCatalog>
  <CategoryFilter categories={['FITNESS', 'NUTRITION', 'SLEEP']} />
  <DifficultyFilter levels={['EASY', 'MEDIUM', 'HARD']} />
  <GoalCard 
    goal={goal}
    onJoin={handleJoin}
    showStats={true}
  />
</GoalCatalog>
```

### Progress Tracking
```jsx
<ProgressTracker>
  <ProgressBar current={5000} target={10000} />
  <StreakCounter days={12} />
  <CheckInButton onCheckIn={handleCheckIn} />
  <ProgressChart data={checkIns} />
</ProgressTracker>
```

### Challenge Leaderboard
```jsx
<ChallengeLeaderboard>
  <LeaderboardHeader challenge={challenge} />
  <RankingList participants={participants} />
  <UserPosition rank={userRank} />
  <PrizeDistribution prizes={challenge.prizeDistribution} />
</ChallengeLeaderboard>
```

---

## Testing Checklist

### Goals
- [ ] List all goals
- [ ] Filter goals by category
- [ ] Create custom goal
- [ ] Join a goal
- [ ] Update progress
- [ ] Complete a goal
- [ ] Verify points awarded
- [ ] Verify coins credited

### Challenges
- [ ] List challenges
- [ ] Create challenge
- [ ] Join challenge
- [ ] Pay entry fee
- [ ] Update progress
- [ ] View leaderboard
- [ ] Complete challenge
- [ ] Distribute prizes
- [ ] Verify winner rewards

### Leaderboards
- [ ] Global leaderboard displays
- [ ] Peer leaderboard works
- [ ] Corporate leaderboard filters correctly
- [ ] Rankings update after goal completion
- [ ] Period filtering (daily/weekly/monthly)

### Achievements
- [ ] List all achievements
- [ ] Unlock achievement automatically
- [ ] Award coins on unlock
- [ ] Secret achievements hidden
- [ ] Achievement progress tracking

### Integration
- [ ] Login dashboard shows leaderboard widget
- [ ] Real-time rank updates
- [ ] Streak calculation accurate
- [ ] Health coins integration working
- [ ] Notifications sent properly

---

## Performance Considerations

### Indexing
All tables have proper indexes on:
- Foreign keys (userId, goalId, challengeId)
- Status fields for filtering
- Rank fields for leaderboard queries
- Composite indexes for common query patterns

### Caching
Consider caching:
- Global leaderboard (update every 5 minutes)
- Goal catalog (update hourly)
- Achievement list (update daily)

### Background Jobs
Schedule periodic tasks:
- Recalculate global rankings (every 5 minutes)
- Update challenge leaderboards (real-time or every minute)
- Check and finalize ended challenges (every hour)
- Calculate streaks (daily at midnight)
- Check achievement unlocks (after each activity)

---

## Security

### Authorization
All endpoints require authentication via JWT token in Authorization header.

### Validation
- Goal targets must be positive numbers
- Challenge dates validated (start < end)
- Entry fees checked against wallet balance
- Progress updates validated against target values

### Rate Limiting
- Goal/challenge creation: 10 per hour per user
- Progress updates: 100 per hour per user
- Leaderboard queries: 60 per minute per user

---

## Future Enhancements

1. **Team Challenges**: Support for team-based competitions
2. **Friend System**: Add friends and view friends-only leaderboards
3. **Social Sharing**: Share achievements on social media
4. **Custom Badges**: Let users design achievement badges
5. **Video Challenges**: Integration with video consultations for verification
6. **Sponsor Challenges**: Corporate-sponsored challenges with bigger prizes
7. **Seasonal Events**: Special limited-time challenges
8. **Leaderboard History**: Track rank changes over time
9. **Challenge Templates**: Pre-made challenge configurations
10. **AI Coach**: Personalized goal recommendations

---

## Support

For issues or questions:
- Check API error messages for specific guidance
- Verify authentication tokens are valid
- Ensure wallet has sufficient coins for entry fees
- Contact technical support for database issues

---

## Changelog

### v1.0.0 (2025-01-15)
- Initial release
- 7 database tables created
- 8 default health goals seeded
- 10 default achievements seeded
- 18 API endpoints implemented
- Health coins integration complete
- Leaderboard ranking system operational
