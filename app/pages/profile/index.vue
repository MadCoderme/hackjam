<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'vue-sonner'
import { 
  LucideUser, 
  LucideUsers, 
  LucideCopy, 
  LucideLogOut, 
  LucidePlus, 
  LucideArrowRight,
  LucideHistory,
  LucideEye
} from 'lucide-vue-next'

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const loading = ref(true)

// --- STATE ---
const profile = ref({
  username: '',
  avatar_url: '',
  team_id: null
})

const team = ref<any>(null)
const teamMembers = ref<any[]>([])
const mySubmissions = ref<any[]>([]) // <--- Added for History

// Forms
const joinCode = ref('')
const newTeamName = ref('')
const isActionLoading = ref(false)

// --- DATA FETCHING ---
const fetchProfileData = async () => {
  if (!user.value) return
  loading.value = true

  try {
    // 1. Get Profile
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.sub) // Changed .sub to .id (Standard Supabase Auth)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    if (profileData) {
      profile.value = profileData
      
      // 2. Fetch Team Data
      if (profileData.team_id) {
        await fetchTeamDetails(profileData.team_id)
      }

      // 3. Fetch My Submissions (Added)
      await fetchMyHistory()
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const fetchTeamDetails = async (teamId: string) => {
  const { data: teamData } = await supabase.from('teams').select('*').eq('id', teamId).single()
  team.value = teamData

  const { data: members } = await supabase.from('profiles').select('id, username, avatar_url').eq('team_id', teamId)
  teamMembers.value = members || []
}

// Added History Fetcher
const fetchMyHistory = async () => {
  const { data } = await supabase
    .from('submissions')
    .select(`
        id, score, status, execution_time, created_at,
        sub_problems ( title, points, challenges ( title ) )
    `)
    .eq('user_id', user.value?.sub)
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (data) mySubmissions.value = data
}

// --- ACTIONS ---

const updateProfile = async () => {
  isActionLoading.value = true
  try {
    const { error } = await supabase.from('profiles').upsert({
      id: user.value?.sub,
      username: profile.value.username,
      avatar_url: profile.value.avatar_url,
      updated_at: new Date()
    })
    if (error) throw error
    toast.success('Profile updated!')
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    isActionLoading.value = false
  }
}

const handleCreateTeam = async () => {
  if (!newTeamName.value) return toast.error('Team Name is required')
  isActionLoading.value = true

  try {
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data: newTeam, error: teamError } = await supabase
      .from('teams')
      .insert({ name: newTeamName.value, invite_code: inviteCode })
      .select()
      .single()

    if (teamError) throw teamError

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ team_id: newTeam.id })
      .eq('id', user.value?.sub)

    if (profileError) throw profileError

    await fetchProfileData()
    newTeamName.value = ''
  } catch (error: any) {
    toast.error(`Error: ${error.message}`)
  } finally {
    isActionLoading.value = false
  }
}

const handleJoinTeam = async () => {
  if (!joinCode.value) return toast.error('Enter an invite code')
  isActionLoading.value = true

  try {
    const { data: foundTeam, error: searchError } = await supabase
      .from('teams').select('id').eq('invite_code', joinCode.value.trim().toUpperCase()).single()

    if (searchError || !foundTeam) throw new Error('Invalid Invite Code')

    const { error: updateError } = await supabase
      .from('profiles').update({ team_id: foundTeam.id }).eq('id', user.value?.sub)

    if (updateError) throw updateError
    await fetchProfileData()
    joinCode.value = ''
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    isActionLoading.value = false
  }
}

const handleLeaveTeam = async () => {
  if (!confirm('Are you sure you want to leave this team?')) return
  isActionLoading.value = true
  try {
    await supabase.from('profiles').update({ team_id: null }).eq('id', user.value?.sub)
    team.value = null
    teamMembers.value = []
    profile.value.team_id = null
  } catch (error: any) {
    toast.error(error.message)
  } finally {
    isActionLoading.value = false
  }
}

const copyCode = () => {
  if (team.value?.invite_code) {
    navigator.clipboard.writeText(team.value.invite_code)
    toast('Code copied to clipboard!')
  }
}

const handleLogout = async () => {
  await supabase.auth.signOut()
  navigateTo('/login')
}

// Date Formatter
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  if (!user.value.sub) {
    navigateTo('/login')
    return
  }
  fetchProfileData()
})
</script>

<template>
  <div class="max-w-5xl mx-auto py-8 space-y-8">
    
    <!-- Top Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <Avatar class="h-20 w-20 border-2 border-primary">
          <AvatarImage :src="profile.avatar_url" />
          <AvatarFallback class="text-xl">{{ profile.username?.substring(0,2).toUpperCase() || 'ME' }}</AvatarFallback>
        </Avatar>
        <div>
          <h1 class="text-3xl font-bold">{{ profile.username || 'Anonymous User' }}</h1>
          <p class="text-muted-foreground">{{ user?.email }}</p>
        </div>
      </div>
      
      <div class="flex gap-2">
        <!-- Link to the Public View -->
        <Button variant="outline" as-child>
          <NuxtLink :to="`/profile/${user?.sub}`">
            <LucideEye class="mr-2 h-4 w-4" /> Public View
          </NuxtLink>
        </Button>
        <Button variant="destructive" @click="handleLogout">Log out</Button>
      </div>
    </div>

    <!-- Main Grid: Settings & Teams -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      
      <!-- LEFT COL: Profile Settings -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <LucideUser class="h-5 w-5" /> Edit Profile
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Username</label>
            <Input v-model="profile.username" placeholder="Enter display name" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">Avatar URL</label>
            <Input v-model="profile.avatar_url" placeholder="https://github.com/..." />
          </div>
        </CardContent>
        <CardFooter>
          <Button @click="updateProfile" :disabled="isActionLoading">Save Changes</Button>
        </CardFooter>
      </Card>

      <!-- RIGHT COL: Team Management -->
      <Card class="flex flex-col">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <LucideUsers class="h-5 w-5" /> Team Status
          </CardTitle>
          <CardDescription>Manage your hackathon squad.</CardDescription>
        </CardHeader>
        
        <CardContent class="flex-1">
          <div v-if="team" class="space-y-6">
            <div class="bg-primary/5 rounded-lg p-4 border border-primary/20">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm text-muted-foreground uppercase font-bold">Current Team</span>
                <Badge variant="default">Active</Badge>
              </div>
              <h2 class="text-2xl font-bold text-primary">{{ team.name }}</h2>
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium">Invite Code</label>
              <div class="flex gap-2">
                <div class="flex-1 bg-muted p-2 rounded text-center font-mono tracking-widest border">
                  {{ team.invite_code }}
                </div>
                <Button variant="outline" size="icon" @click="copyCode">
                  <LucideCopy class="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <h3 class="text-sm font-medium mb-3">Team Members</h3>
              <div class="space-y-2">
                <div v-for="member in teamMembers" :key="member.id" class="flex items-center gap-3 p-2 hover:bg-muted rounded transition-colors">
                  <Avatar class="h-8 w-8">
                    <AvatarFallback>{{ member.username?.substring(0,2).toUpperCase() }}</AvatarFallback>
                  </Avatar>
                  <span class="text-sm font-medium">
                     <NuxtLink :to="`/user/${member.id}`" class="hover:underline">
                        {{ member.username }}
                     </NuxtLink>
                  </span>
                  <Badge v-if="member.id === user?.id" variant="secondary" class="ml-auto text-xs">You</Badge>
                </div>
              </div>
            </div>
            <div class="pt-4">
              <Button variant="destructive" class="w-full" @click="handleLeaveTeam">
                <LucideLogOut class="mr-2 h-4 w-4" /> Leave Team
              </Button>
            </div>
          </div>
          <div v-else class="h-full">
            <Tabs default-value="join" class="w-full h-full flex flex-col">
              <TabsList class="grid w-full grid-cols-2">
                <TabsTrigger value="join">Join</TabsTrigger>
                <TabsTrigger value="create">Create</TabsTrigger>
              </TabsList>
              <TabsContent value="join" class="flex-1 flex flex-col justify-center gap-4 py-6">
                <Input v-model="joinCode" placeholder="Code: A1B2C3" class="text-center uppercase font-mono" maxlength="6" />
                <Button @click="handleJoinTeam" :disabled="isActionLoading">Join Squad <LucideArrowRight class="ml-2 h-4 w-4" /></Button>
              </TabsContent>
              <TabsContent value="create" class="flex-1 flex flex-col justify-center gap-4 py-6">
                <Input v-model="newTeamName" placeholder="Team Name" />
                <Button @click="handleCreateTeam" :disabled="isActionLoading" variant="secondary"> <LucidePlus class="mr-2 h-4 w-4" /> Create Team</Button>
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Bottom Section: Submission History -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
           <LucideHistory class="h-5 w-5" /> Submission History
        </CardTitle>
      </CardHeader>
      <CardContent>
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
             <TableRow v-for="sub in mySubmissions" :key="sub.id">
                <TableCell>
                   <div class="font-medium">{{ sub.sub_problems?.challenges?.title || 'Unknown Challenge' }}</div>
                   <div class="text-xs text-muted-foreground">{{ sub.sub_problems?.title || 'Unknown Task' }}</div>
                </TableCell>
                <TableCell>
                   <Badge :variant="sub.status === 'Passed' ? 'default' : sub.status === 'Processing' ? 'secondary' : 'destructive'">
                      {{ sub.status }}
                   </Badge>
                </TableCell>
                <TableCell class="font-mono text-xs">{{ sub.execution_time || '-' }}</TableCell>
                <TableCell class="font-bold">
                   {{ sub.score }} <span class="text-xs font-normal text-muted-foreground">/ {{ sub.sub_problems?.points || 100 }}</span>
                </TableCell>
                <TableCell class="text-right text-xs text-muted-foreground">
                   {{ formatDate(sub.created_at) }}
                </TableCell>
             </TableRow>
             <TableRow v-if="mySubmissions.length === 0">
                <TableCell colspan="5" class="text-center py-8 text-muted-foreground">No submissions recorded.</TableCell>
             </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

  </div>
</template>