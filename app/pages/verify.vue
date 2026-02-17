<script setup lang="ts">
const user = useSupabaseUser()
const supabase = useSupabaseClient()

onMounted(async() => {
    if (user.value) {
        const { data, error } = await supabase.from('profiles')
            .select('username')
            .eq('id', user.value.sub)
        if (!error) {
            if (!data[0]?.id) {
                await supabase.from('profiles')
                    .insert({
                        id: user.value.sub,
                        username: user.value.user_metadata.user_name
                    })
                navigateTo('/')
            }
        }
    }
})

</script>
<template>
    <h1 class="text-xl font-bold">Verifying user...</h1>
</template>