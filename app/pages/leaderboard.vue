<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

const supabase = useSupabaseClient()
const mode = ref('teams') // 'teams' | 'individuals'
const leaderboardData = ref<any[]>([])

// Fetch Logic
const fetchLeaderboard = async () => {
  leaderboardData.value = [] // clear old
  
  if (mode.value === 'teams') {
    // Fetch from the SQL View we created
    const { data } = await supabase
      .from('team_standings')
      .select('*')
      .order('total_score', { ascending: false })
    leaderboardData.value = data || []
  } else {
    // Individual Submissions (Sum of max scores per problem)
    // Note: Complex aggregation is better done in SQL Views, 
    // but here is a simple fetch of raw submissions to demo structure
    const { data } = await supabase
      .from('profiles')
      .select(`
        id,
        username,
        submissions ( score )
      `)
    
    // JS Aggregation for Individual (Simplified)
    // In production: Create an 'individual_standings' SQL View similar to teams
    const calculated = data?.map((p: any) => ({
      id: p.id,
      name: p.username,
      total_score: p.submissions.reduce((a: number, b: any) => a + b.score, 0)
    })).sort((a, b) => b.total_score - a.total_score)
    
    leaderboardData.value = calculated || []
  }
}

const handleClick = (entry) => {
  if (mode.value === 'teams') {
    navigateTo(`/team/${entry.team_id}`)
  } else {
    navigateTo(`/profile/${entry.id}`)
  }
}

// Watch mode change
watch(mode, () => fetchLeaderboard())

onMounted(() => {
  fetchLeaderboard()
  // Add realtime listener here if desired
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold">Hackathon Standings</h1>
      
      <!-- Mode Toggle -->
      <Tabs v-model="mode" class="w-[400px]">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="teams">Team Ranking</TabsTrigger>
          <TabsTrigger value="individuals">Solo Ranking</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <div class="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[100px]">Rank</TableHead>
            <TableHead>{{ mode === 'teams' ? 'Team Name' : 'Participant' }}</TableHead>
            <TableHead class="text-right">Total Points</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="(entry, index) in leaderboardData" :key="index" @click="handleClick(entry)" class="cursor-pointer hover:bg-accent">
            <TableCell class="font-medium text-lg">
               <span v-if="index === 0">🥇</span>
               <span v-else-if="index === 1">🥈</span>
               <span v-else-if="index === 2">🥉</span>
               <span v-else>#{{ index + 1 }}</span>
            </TableCell>
            
            <TableCell class="flex items-center gap-3">
              <Avatar class="h-8 w-8">
                <AvatarFallback class="bg-primary/20 text-primary">
                  {{ (mode === 'teams' ? entry.team_name : entry.name)?.substring(0,2).toUpperCase() }}
                </AvatarFallback>
              </Avatar>
              <div class="font-medium">
                {{ mode === 'teams' ? entry.team_name : entry.name }}
              </div>
            </TableCell>
            
            <TableCell class="text-right font-bold text-lg">
              {{ entry.total_score }}
            </TableCell>
          </TableRow>
          
          <TableRow v-if="leaderboardData.length === 0">
             <TableCell colspan="3" class="text-center py-8 text-muted-foreground">
               No data available yet.
             </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>