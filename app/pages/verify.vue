<script setup lang="ts">
import { watch } from 'vue'

const user = useSupabaseUser()
const supabase = useSupabaseClient()

const ensureProfileAndRedirect = async (u: any) => {
    if (!u) return
    const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', u.sub)
        .limit(1)

    if (error) {
        console.error('Error fetching profile:', error)
        return
    }

    if (!data || data.length === 0) {
        const username = u?.user_metadata?.user_name ?? u?.email ?? `user_${String(u.sub).slice(0,6)}`
        const { error: insertError } = await supabase.from('profiles').insert({ id: u.sub, username })
        if (insertError) {
            console.error('Insert error', insertError)
            return
        }
    }

    navigateTo('/')
}

watch(user, (val) => { ensureProfileAndRedirect(val) }, { immediate: true })

</script>
<template>
    <h1 class="text-xl font-bold">Verifying user...</h1>
</template>