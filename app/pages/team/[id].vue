<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'vue-sonner'
import { 
  LucideUsers, 
  LucideTrophy, 
  LucideCopy, 
  LucideTarget, 
  LucideShield,
  LucideActivity
} from 'lucide-vue-next'

const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()

const teamId = route.params.id as string
const loading = ref(true)

// State
const team = ref<any>(null)
const members = ref<any[]>([])
const teamSubmissions = ref<any[]>([])
const challengesStats = ref<any[]>([])

// Computed
const isMember = computed(() => {
  if (!user.value || !members.value.length) return false
  return members.value.some(m => m.id === user.value.id)
})

const totalTeamScore = computed(() => {
  // Logic: Sum of the MAX score of each unique sub_problem across all members
  const bestScores: Record<string, number> = {}
  
  teamSubmissions.value.forEach(sub => {
    const currentBest = bestScores[sub.sub_problem_id] || 0
    if (sub.score > currentBest) {
      bestScores[sub.sub_problem_id] = sub.score
    }
  })

  return Object.values(bestScores).reduce((a, b) => a + b, 0)
})

const fetchTeamData = async () => {
  loading.value = true
  try {
    // 1. Fetch Team Details
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single()
    
    if (teamError) throw teamError
    team.value = teamData

    // 2. Fetch Members
    const { data: memberData, error: memberError } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('team_id', teamId)

    if (memberError) throw memberError
    members.value = memberData

    // 3. Fetch Submissions (for Stats)
    // We get all submissions by these users
    const memberIds = memberData.map(m => m.id)
    if (memberIds.length > 0) {
      const { data: subs, error: subError } = await supabase
        .from('submissions')
        .select(`
          id, score, status, created_at, sub_problem_id, user_id,
          sub_problems (
            id, title, points,
            challenges ( id, title )
          )
        `)
        .in('user_id', memberIds)
        .order('created_at', { ascending: false })

      if (subError) throw subError
      teamSubmissions.value = subs || []
      
      calculateChallengeProgress(subs)
    }

  } catch (err: any) {
    console.error(err)
    toast.error("Failed to load team data")
  } finally {
    loading.value = false
  }
}

// Helper: Group submissions by Challenge to show progress bars
const calculateChallengeProgress = (subs: any[]) => {
  const map: Record<string, any> = {}

  subs.forEach(sub => {
    const challengeId = sub.sub_problems?.challenges?.id
    const challengeTitle = sub.sub_problems?.challenges?.title
    const taskTitle = sub.sub_problems?.title
    const taskPoints = sub.sub_problems?.points || 100

    if (!challengeId) return

    if (!map[challengeId]) {
      map[challengeId] = {
        id: challengeId,
        title: challengeTitle,
        totalPointsAttempted: 0, // In a real app, you'd fetch the Challenge Total Points
        earnedPoints: 0,
        solvedTasks: new Set(),
        lastActive: sub.created_at
      }
    }

    // Very simple aggregation:
    // If status is Passed, we count it. 
    // Note: This logic assumes we know the total points. 
    // For this UI, we will just show "Points Earned" vs "Tasks Solved"
    
    // Check if this specific submission is the best for this task
    // (Simplified: Just adding up scores for unique passed tasks)
    if (sub.status === 'Passed' && !map[challengeId].solvedTasks.has(sub.sub_problem_id)) {
      map[challengeId].solvedTasks.add(sub.sub_problem_id)
      map[challengeId].earnedPoints += sub.score
    }
  })

  challengesStats.value = Object.values(map)
}

const copyInvite = () => {
  navigator.clipboard.writeText(team.value.invite_code)
  toast.success("Invite code copied!")
}

onMounted(() => {
  fetchTeamData()
})
</script>

<template>
  <div v-if="loading" class="flex justify-center items-center h-[50vh]">
    <div class="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
  </div>

  <div v-else-if="team" class="container max-w-6xl mx-auto py-8 space-y-8">
    
    <!-- HEADER -->
    <div class="relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow">
      <div class="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>
      <div class="p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        
        <div class="flex items-center gap-6">
          <div class="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary">
             <LucideShield class="h-10 w-10 text-primary" />
          </div>
          <div>
            <h1 class="text-3xl font-bold tracking-tight">{{ team.name }}</h1>
            <div class="flex items-center gap-2 mt-2 text-muted-foreground">
              <LucideUsers class="h-4 w-4" />
              <span>{{ members.length }} Members</span>
              <span class="mx-2">•</span>
              <LucideTrophy class="h-4 w-4 text-yellow-500" />
              <span class="text-foreground font-semibold">{{ totalTeamScore }} Total Points</span>
            </div>
          </div>
        </div>

        <div v-if="isMember" class="flex flex-col items-end gap-2">
           <div class="text-xs font-semibold uppercase text-muted-foreground">Invite Code</div>
           <div class="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-md border">
             <span class="font-mono tracking-widest">{{ team.invite_code }}</span>
             <Button variant="ghost" size="icon" class="h-6 w-6" @click="copyInvite">
               <LucideCopy class="h-3 w-3" />
             </Button>
           </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      <!-- LEFT COL: Roster -->
      <div class="lg:col-span-1 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle class="text-lg">Hackers</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div v-for="member in members" :key="member.id" class="flex items-center gap-3">
              <Avatar>
                <AvatarImage :src="member.avatar_url" />
                <AvatarFallback>{{ member.username?.substring(0,2).toUpperCase() }}</AvatarFallback>
              </Avatar>
              <div class="flex-1 overflow-hidden">
                <NuxtLink :to="`/profile/${member.id}`" class="font-medium hover:underline block truncate">
                  {{ member.username }}
                </NuxtLink>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Recent Activity Feed (Mini) -->
        <Card>
          <CardHeader>
            <CardTitle class="text-lg flex items-center gap-2">
              <LucideActivity class="h-4 w-4" /> Recent Feats
            </CardTitle>
          </CardHeader>
          <CardContent class="p-0">
            <div class="space-y-0 divide-y">
              <div v-for="sub in teamSubmissions.slice(0, 5)" :key="sub.id" class="p-4 flex items-start gap-3 text-sm">
                <Badge :variant="sub.status === 'Passed' ? 'default' : 'destructive'" class="mt-0.5 h-2 w-2 rounded-full p-0" />
                <div>
                  <p>
                    <span class="font-semibold">{{ members.find(m => m.id === sub.user_id)?.username }}</span>
                    {{ sub.status === 'Passed' ? 'solved' : 'attempted' }}
                    <span class="text-muted-foreground">{{ sub.sub_problems?.title }}</span>
                  </p>
                  <p class="text-xs text-muted-foreground mt-1">{{ new Date(sub.created_at).toLocaleTimeString() }}</p>
                </div>
                <div v-if="sub.score > 0" class="ml-auto font-mono text-xs font-bold text-green-600">
                  +{{ sub.score }}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- RIGHT COL: Performance Stats -->
      <div class="lg:col-span-2 space-y-6">
        
        <h2 class="text-xl font-bold">Active Challenges</h2>
        
        <div v-if="challengesStats.length === 0" class="text-center py-10 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
          No challenges attempted yet.
        </div>

        <div v-else class="space-y-4">
          <Card v-for="stat in challengesStats" :key="stat.id">
            <CardHeader class="pb-2">
              <div class="flex justify-between items-start">
                <CardTitle>{{ stat.title }}</CardTitle>
                <Badge variant="outline" class="flex gap-1">
                   <LucideTarget class="h-3 w-3" /> {{ stat.solvedTasks.size }} Tasks Solved
                </Badge>
              </div>
              <CardDescription>Last active: {{ new Date(stat.lastActive).toLocaleDateString() }}</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="flex items-center justify-between text-sm mb-2">
                <span class="text-muted-foreground">Team Contribution</span>
                <span class="font-bold">{{ stat.earnedPoints }} pts Earned</span>
              </div>
              <!-- Mock Progress: Assuming ~300 pts per challenge roughly. In real app, calculate actual totals. -->
              <Progress :model-value="Math.min((stat.earnedPoints / 300) * 100, 100)" class="h-2" />
            </CardContent>
          </Card>
        </div>

        <h2 class="text-xl font-bold pt-4">Submission Breakdown</h2>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Result</TableHead>
                <TableHead class="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="sub in teamSubmissions.slice(0, 8)" :key="sub.id">
                <TableCell class="font-medium">
                  {{ members.find(m => m.id === sub.user_id)?.username }}
                </TableCell>
                <TableCell>{{ sub.sub_problems?.title }}</TableCell>
                <TableCell>
                  <Badge :variant="sub.status === 'Passed' ? 'default' : 'secondary'">
                    {{ sub.status }}
                  </Badge>
                </TableCell>
                <TableCell class="text-right font-mono">{{ sub.score }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>

      </div>
    </div>
  </div>
  
  <div v-else class="text-center py-20">
    <h1 class="text-2xl font-bold text-muted-foreground">Team not found</h1>
    <Button variant="link" @click="router.push('/')">Go Home</Button>
  </div>
</template>