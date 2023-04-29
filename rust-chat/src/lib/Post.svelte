<!-- A basic post within our chat application. -->
<script lang="ts">
    export let nick: string;
    export let timestamp: Date | null;
    export let content: string;
    export let isReply = false;

    function getFullTime() {
        return timestamp !== null
            ? timestamp.toLocaleString()
            : "";
    }
    function getTimeOnly() {
        return timestamp !== null
            ? timestamp.toLocaleTimeString()
            : "";
    }
</script>

<article class="media">
    <figure class="media-left">
        <p class="image w100">
            {#if isReply}
                <small>{getTimeOnly()}</small>
            {:else}
                <!-- <img alt="Avatar for {nick}" src={getAvatarIcon()} /> -->
                <span class="avatar">{nick.charAt(0).toUpperCase()}</span>
            {/if}
        </p>
    </figure>
    <div class="media-content">
        <div class="content">
            <p>
                {#if !isReply}
                <strong>{nick}</strong> <small>{getFullTime()}</small>
                <br />
                {/if}
                {content}
            </p>
        </div>
        <!-- <nav class="level is-mobile">
            <div class="level-left">
                <button class="level-item button is-primary mx-2">
                    <span class="icon is-small"><i class="fas fa-reply"/>Reply</span >
                </button>
            </div>
        </nav> -->
    </div>
    <div class="media-right">
    </div>
</article>

<style>
.avatar {
    align-items: center;
    border-radius: .5em;
    background-color: #3e8ed0;
    color: #fff;
    display: inline-flex;
    height: 1.5em;
    padding-left: .5em;
    padding-right: .5em;
}

.w100 {
    width: 100px;
}

</style>