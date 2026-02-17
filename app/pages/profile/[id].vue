<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { LucideTrophy, LucideCalendar, LucideShield } from 'lucide-vue-next'

const route = useRoute()
const supabase = useSupabaseClient()
const loading = ref(true)

const profile = ref<any>(null)
const team = ref<any>(null)
const submissions = ref<any[]>([])
const stats = ref({ totalScore: 0, passed: 0 })

const fetchPublicProfile = async () => {
  const userId = route.params.id as string
  loading.value = true

  try {
    // 1. Fetch Profile & Team
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, avatar_url, teams(name)')
      .eq('id', userId)
      .single()
    
    if (profileData) {
      profile.value = profileData
      team.value = profileData.teams
      useHead({
        title: `HackJam - ${profileData.username}'s Profile`,
        meta: [
          { name: 'description', content: `View the profile of ${profileData.username} on HackJam. See their hackathon achievements, submissions, and team affiliations.` }
        ]
      })
    }

    // 2. Fetch Submissions with relations
    const { data: subs } = await supabase
      .from('submissions')
      .select(`
        id, score, status, execution_time, created_at,
        sub_problems ( title, points, challenges ( title ) )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (subs) {
      submissions.value = subs
      // Calculate Stats
      stats.value.totalScore = subs.reduce((acc, curr) => acc + (curr.score || 0), 0)
      stats.value.passed = subs.filter(s => s.status === 'Passed').length
    }

  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

// Helper: Format Date
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  if (!user.value.sub) {
    navigateTo('/login')
    return
  }
  fetchPublicProfile()
})

</script>

<template>
  <div v-if="loading" class="text-center py-20">Loading profile...</div>
  
  <div v-else-if="profile" class="max-w-4xl mx-auto py-8 space-y-8">
    
    <!-- Header Section -->
    <Card class="bg-muted/30 border-none shadow-none">
      <CardContent class="flex flex-col md:flex-row items-center gap-6 py-8">
        <Avatar class="h-24 w-24 border-4 border-background shadow-sm">
          <AvatarImage :src="profile.avatar_url" />
          <AvatarFallback class="text-2xl">{{ profile.username?.substring(0,2).toUpperCase() }}</AvatarFallback>
        </Avatar>
        
        <div class="text-center md:text-left space-y-2 flex-1">
          <h1 class="text-3xl font-bold">{{ profile.username }}</h1>
          <div class="flex items-center justify-center md:justify-start gap-3">
            <Badge variant="outline" class="px-3 py-1 text-sm">
              <LucideShield class="w-3 h-3 mr-1" /> {{ team ? team.name : 'Solo Coder' }}
            </Badge>
            <span class="text-sm text-muted-foreground flex items-center gap-1">
              <LucideCalendar class="w-3 h-3" /> Joined recently
            </span>
          </div>
        </div>

        <!-- Mini Stats -->
        <div class="flex gap-6 text-center">
          <div>
            <div class="text-2xl font-bold text-primary">{{ stats.totalScore }}</div>
            <div class="text-xs text-muted-foreground uppercase font-bold">Total Points</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-green-500">{{ stats.passed }}</div>
            <div class="text-xs text-muted-foreground uppercase font-bold">Solutions</div>
          </div>
        </div>
      </CardContent>
    </Card>

    <Separator />

    <!-- Submission History -->
    <div class="space-y-4">
      <h2 class="text-xl font-bold flex items-center gap-2">
        <LucideTrophy class="w-5 h-5 text-yellow-500" /> Recent Submissions
      </h2>
      
      <div class="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Challenge / Task</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Score</TableHead>
              <TableHead class="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="sub in submissions" :key="sub.id">
              <TableCell>
                <div class="font-medium">{{ sub.sub_problems?.challenges?.title }}</div>
                <div class="text-xs text-muted-foreground">{{ sub.sub_problems?.title }}</div>
              </TableCell>
              <TableCell>
                <Badge :variant="sub.status === 'Passed' ? 'default' : sub.status === 'Processing' ? 'secondary' : 'destructive'">
                  {{ sub.status }}
                </Badge>
              </TableCell>
              <TableCell class="font-mono text-xs">{{ sub.execution_time || '-' }}</TableCell>
              <TableCell class="font-bold">
                {{ sub.score }} <span class="text-xs font-normal text-muted-foreground">/ {{ sub.sub_problems?.points }}</span>
              </TableCell>
              <TableCell class="text-right text-xs text-muted-foreground">
                {{ formatDate(sub.created_at) }}
              </TableCell>
            </TableRow>
            <TableRow v-if="submissions.length === 0">
              <TableCell colspan="5" class="text-center py-8 text-muted-foreground">
                No submissions yet.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  </div>
  
  <div v-else class="text-center py-20">User not found</div>
</template>