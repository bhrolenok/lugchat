<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  // import { invoke } from "@tauri-apps/api/tauri"

  import Post from "./lib/Post.svelte";

  type Status = "Online" | "Offline";

  class UserDetails {
    color: string;
    status: Status;
  }

  class UserMessage {
    nick: string;
    timestamp: Date;
    content: string;
  }

  let message: string = "";
  let posts: UserMessage[] = [];
  let users: Map<string, UserDetails> = new Map();
  const listenerDeregistrations: UnlistenFn[] = [];


  onMount(async () => {
    listenerDeregistrations.push(await listen<string>('post', (event) => {
      let content = JSON.parse(event.payload);
      posts.push(content);
      posts = posts;
    }));
  });

  onDestroy(() => {
    listenerDeregistrations.forEach(fn => {
      fn();
    });
  });

  function postMessage() {
    posts.push({nick: "Me", content: message, timestamp: new Date()});
    posts=posts;
    message="";
  }
</script>

<main class="container">
  <div class="">
    <div class="mx-3">
      {#each posts as post, index }
      <Post nick={post.nick} timestamp={post.timestamp} content={post.content} isReply={index % 2 == 1}></Post>
      {/each}
    </div>
    <div class="bottom-fixed columns">
      <textarea class="column is-three-quarters mr-2" bind:value={message} placeholder="Message" rows="1" />
      <button class="column" on:click={postMessage}>Submit</button>
    </div>
  </div>
</main>

<style>
  .bottom-fixed {
    bottom: 0;
    position: fixed;
    margin: 10px 10px 20px 10px;
    padding: 0px 10px;
    width: calc(100vw - 20px);
    z-index: 50;
  }
</style>
