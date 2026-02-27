<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { toPng } from 'html-to-image'
import { toast } from 'vue-sonner'
import { 
  LucideShare2, 
  LucideDownload, 
  LucideLoader2, 
  LucideTrophy, 
  LucideCheckCircle2
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const route = useRoute()
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const challengeId = route.params.id as string

// State
const loading = ref(true)
const generating = ref(false)
const cardRef = ref<HTMLElement | null>(null)

// Data
const challenge = ref<any>(null)
const stats = ref({
  rank: 0,
  score: 0,
  totalPoints: 0,
  percent: 0,
  username: '',
  avatar_url: ''
})

const loadData = async () => {
  if (!user.value) return navigateTo('/login')

  try {
    // 1. Parallel Fetch: Challenge Details & Total Possible Points
    const [chalReq, pointsReq] = await Promise.all([
      supabase.from('challenges').select('title, tags').eq('id', challengeId).single(),
      supabase.from('sub_problems').select('points').eq('challenge_id', challengeId)
    ])

    if (chalReq.error) throw chalReq.error
    challenge.value = chalReq.data

    const totalPossible = pointsReq.data?.reduce((acc, t) => acc + t.points, 0) || 0

    // 2. Efficient Fetch: Get User Rank using our new SQL Function
    const { data: rankData, error: rankError } = await supabase
      .rpc('get_user_challenge_rank', {
        p_challenge_id: challengeId,
        p_user_id: user.value.sub
      })
      .maybeSingle() // Use maybeSingle in case they haven't submitted anything

    if (rankError) throw rankError

    if (rankData) {
      stats.value = {
        rank: Number(rankData.rank),
        score: Number(rankData.total_score),
        totalPoints: totalPossible,
        percent: totalPossible > 0 ? Math.round((Number(rankData.total_score) / totalPossible) * 100) : 0,
        username: rankData.username || 'Anonymous',
        avatar_url: rankData.avatar_url || ''
      }
    } else {
      // User hasn't participated yet
      stats.value.username = user.value.user_metadata.full_name || 'Me'
      stats.value.totalPoints = totalPossible
    }

  } catch (e: any) {
    console.error(e)
    toast.error("Failed to load stats")
  } finally {
    loading.value = false
  }
}

// ... Actions (handleDownload, handleShare) remain exactly the same ...
const handleDownload = async () => {
  if (!cardRef.value) return
  generating.value = true
  try {
    const dataUrl = await toPng(cardRef.value, { cacheBust: true, pixelRatio: 2 })
    const link = document.createElement('a')
    link.download = `hackjam-${stats.value.username}-rank.png`
    link.href = dataUrl
    link.click()
    toast.success("Image downloaded!")
  } catch (err) {
    toast.error("Failed to generate image")
  } finally {
    generating.value = false
  }
}

const handleShare = async () => {
  if (!cardRef.value) return
  generating.value = true
  try {
    const dataUrl = await toPng(cardRef.value, { pixelRatio: 2 })
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], 'ranking.png', { type: blob.type })
    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `I ranked #${stats.value.rank} in ${challenge.value.title}!`,
        text: `Check out my result on HackJam. Scored ${stats.value.score} points.`,
        files: [file]
      })
    } else {
        const link = document.createElement('a')
        link.download = `hackjam-${stats.value.username}-rank.png`
        link.href = dataUrl
        link.click()
        toast.info("Image Downloaded (Sharing not supported)")
    }
  } catch (err) {
    const url = window.location.origin + `/challenge/${challengeId}`
    navigator.clipboard.writeText(url)
    toast.info("Link copied")
  } finally {
    generating.value = false
  }
}

onMounted(() => {
  loadData()
})

definePageMeta({ layout: 'default' })
</script>

<template>
  <div class="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-4 md:p-8 space-y-8 bg-zinc-950/50">
    
    <div v-if="loading" class="flex flex-col items-center gap-4">
      <LucideLoader2 class="h-8 w-8 animate-spin text-primary" />
      <p class="text-muted-foreground">Calculating your rank...</p>
    </div>

    <div v-else class="flex flex-col xl:flex-row items-center gap-12 max-w-6xl w-full">
      <!-- (Template structure remains exactly the same as previous response) -->
      <!-- Just ensure the v-else block wraps the card and controls -->
      
      <!-- LEFT: The Preview Area -->
      <div class="flex-1 flex justify-center w-full">
        <div class="relative group perspective-1000">
          <div ref="cardRef" class="w-[400px] h-[500px] md:w-[600px] md:h-[314px] relative overflow-hidden rounded-xl bg-[#09090b] text-white shadow-2xl flex flex-col md:flex-row font-sans selection:bg-transparent border border-white/10">
             <!-- ... (Keep your beautiful card design here) ... -->
             <!-- Reuse the design from the previous response -->
              <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 via-zinc-900 to-black z-0"></div>
              <div class="absolute top-[-50px] right-[-50px] w-64 h-64 bg-purple-600/30 rounded-full blur-[80px]"></div>
              <div class="absolute bottom-[-50px] left-[-50px] w-64 h-64 bg-blue-600/20 rounded-full blur-[80px]"></div>
              <div class="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 z-0 mix-blend-overlay"></div>

              <div class="relative z-10 flex flex-col md:flex-row w-full h-full p-8 gap-8 items-center justify-between">
                <div class="flex flex-col items-center md:items-start gap-4 flex-1">
                  <div class="flex items-center gap-2 mb-2 opacity-80">
                    <div class="h-6 w-6 bg-white rounded flex items-center justify-center text-black font-bold text-xs">HJ</div>
                    <span class="font-bold tracking-widest text-sm uppercase">HackJam</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <div class="relative">
                      <img :src="stats.avatar_url || 'https://github.com/shadcn.png'" class="h-20 w-20 rounded-full border-4 border-white/10 shadow-xl object-cover" crossorigin="anonymous" />
                      <div class="absolute -bottom-2 -right-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1">
                        <LucideTrophy class="h-3 w-3" /> #{{ stats.rank }}
                      </div>
                    </div>
                    <div class="text-center md:text-left">
                      <h2 class="text-2xl font-bold leading-tight">{{ stats.username }}</h2>
                      <p class="text-indigo-200 text-sm">Contender</p>
                    </div>
                  </div>
                  <div class="mt-auto pt-4 text-center md:text-left">
                    <p class="text-xs text-zinc-400 uppercase tracking-wider mb-1">Challenge Completed</p>
                    <h3 class="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">{{ challenge?.title }}</h3>
                    <div class="flex gap-2 mt-2 justify-center md:justify-start">
                      <Badge v-for="tag in challenge?.tags" :key="tag" variant="secondary" class="bg-white/10 text-white border-none hover:bg-white/20">{{ tag }}</Badge>
                    </div>
                  </div>
                </div>
                <div class="flex flex-col items-center justify-center bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 min-w-[180px]">
                  <div class="text-center space-y-1 mb-6">
                    <p class="text-sm text-zinc-400 font-medium uppercase">Total Score</p>
                    <div class="text-5xl font-black tracking-tighter text-white drop-shadow-lg">{{ stats.score }}</div>
                    <p class="text-xs text-zinc-500">out of {{ stats.totalPoints }}</p>
                  </div>
                  <div class="w-full space-y-3">
                    <div class="flex justify-between text-sm font-medium">
                      <span class="text-zinc-300">Accuracy</span>
                      <span class="text-green-400">{{ stats.percent }}%</span>
                    </div>
                    <div class="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div class="h-full bg-gradient-to-r from-green-400 to-emerald-600 rounded-full" :style="{ width: `${stats.percent}%` }"></div>
                    </div>
                  </div>
                </div>
              </div>
          </div>
        </div>
      </div>

      <!-- RIGHT: Controls -->
      <div class="w-full md:w-[350px] space-y-6">
        <div>
          <h1 class="text-3xl font-bold mb-2">Share your Result</h1>
          <p class="text-muted-foreground">Show who you are (the boss). Download the card or share directly to social media.</p>
        </div>
        <Card>
          <div class="p-6 space-y-4">
            <Button class="w-full h-12 text-lg" @click="handleShare" :disabled="generating">
              <LucideShare2 class="mr-2 h-5 w-5" /> {{ generating ? 'Generating...' : 'Share Result' }}
            </Button>
            <div class="grid grid-cols-2 gap-3">
              <Button variant="outline" class="w-full" @click="handleDownload" :disabled="generating">
                <LucideDownload class="mr-2 h-4 w-4" /> Download
              </Button>
              <Button variant="secondary" class="w-full" as-child>
                 <NuxtLink :to="`/challenge/${challengeId}`">Back to Code</NuxtLink>
              </Button>
            </div>
          </div>
        </Card>
      </div>

    </div>
  </div>
</template>

<style scoped>
.font-sans { font-family: 'Inter', system-ui, sans-serif; }
</style>