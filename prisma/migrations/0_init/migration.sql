-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "steamId" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "steamId" TEXT,
    "preferences" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "profileBackgroundUrl" TEXT,
    "profileBackgroundMode" TEXT NOT NULL DEFAULT 'URL',
    "profileBackgroundGameId" TEXT,
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mobileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverImage" TEXT,
    "backgroundImage" TEXT,
    "releaseDate" TIMESTAMP(3),
    "description" TEXT,
    "screenshots" TEXT[],
    "videos" TEXT[],
    "steamUrl" TEXT,
    "opencriticUrl" TEXT,
    "igdbUrl" TEXT,
    "hltbUrl" TEXT,
    "opencriticScore" INTEGER,
    "igdbScore" INTEGER,
    "steamAppId" TEXT,
    "steamReviewScore" TEXT,
    "steamReviewCount" INTEGER,
    "steamReviewPercent" INTEGER,
    "isDlc" BOOLEAN NOT NULL DEFAULT false,
    "igdbId" TEXT,
    "studio" TEXT,
    "genres" TEXT,
    "platforms" JSONB,
    "parentId" TEXT,
    "igdbTime" JSONB,
    "storyline" TEXT,
    "status" INTEGER,
    "gameType" INTEGER,
    "relatedGames" JSONB,
    "dataMissing" BOOLEAN NOT NULL DEFAULT false,
    "dataFetched" BOOLEAN NOT NULL DEFAULT false,
    "hltbMain" INTEGER,
    "hltbExtra" INTEGER,
    "hltbCompletionist" INTEGER,
    "predictedMain" DOUBLE PRECISION,
    "predictedExtra" DOUBLE PRECISION,
    "predictedCompletionist" DOUBLE PRECISION,
    "usersMain" INTEGER,
    "usersMainCount" INTEGER,
    "usersExtra" INTEGER,
    "usersExtraCount" INTEGER,
    "usersCompletionist" INTEGER,
    "usersCompletionistCount" INTEGER,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "imageStatus" TEXT NOT NULL DEFAULT 'OK',
    "franchise" TEXT,
    "hypes" INTEGER,
    "summary" TEXT,
    "keywords" TEXT[],
    "themes" TEXT[],
    "ports" JSONB,
    "remakes" JSONB,
    "remasters" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLibrary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BACKLOG',
    "playtimeSteam" INTEGER NOT NULL DEFAULT 0,
    "playtime2weeks" INTEGER NOT NULL DEFAULT 0,
    "playtimeManual" INTEGER,
    "playtimeMain" INTEGER,
    "playtimeExtra" INTEGER,
    "playtimeCompletionist" INTEGER,
    "progressManual" INTEGER,
    "targetedCompletionType" TEXT NOT NULL DEFAULT 'MAIN',
    "lastPlayed" TIMESTAMP(3),
    "customCoverImage" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "ownedPlatforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserFollows" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserFollows_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TagToUserLibrary" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TagToUserLibrary_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_steamId_key" ON "User"("steamId");

-- CreateIndex
CREATE UNIQUE INDEX "User_mobileKey_key" ON "User"("mobileKey");

-- CreateIndex
CREATE UNIQUE INDEX "Game_steamAppId_key" ON "Game"("steamAppId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_igdbId_key" ON "Game"("igdbId");

-- CreateIndex
CREATE INDEX "Game_releaseDate_idx" ON "Game"("releaseDate");

-- CreateIndex
CREATE INDEX "Game_opencriticScore_idx" ON "Game"("opencriticScore");

-- CreateIndex
CREATE INDEX "UserLibrary_userId_status_idx" ON "UserLibrary"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserLibrary_userId_gameId_key" ON "UserLibrary"("userId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_gameId_idx" ON "ActivityLog"("gameId");

-- CreateIndex
CREATE INDEX "_UserFollows_B_index" ON "_UserFollows"("B");

-- CreateIndex
CREATE INDEX "_TagToUserLibrary_B_index" ON "_TagToUserLibrary"("B");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLibrary" ADD CONSTRAINT "UserLibrary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLibrary" ADD CONSTRAINT "UserLibrary_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserFollows" ADD CONSTRAINT "_UserFollows_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserFollows" ADD CONSTRAINT "_UserFollows_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToUserLibrary" ADD CONSTRAINT "_TagToUserLibrary_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToUserLibrary" ADD CONSTRAINT "_TagToUserLibrary_B_fkey" FOREIGN KEY ("B") REFERENCES "UserLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

