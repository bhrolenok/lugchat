<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { invoke } from "@tauri-apps/api/tauri"

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

  let chatHistory: HTMLDivElement;
  let message: string = "";
  let posts: UserMessage[] = [];
  let users: Map<string, UserDetails> = new Map();
  const listenerDeregistrations: UnlistenFn[] = [];

  onMount(async () => {
    listenerDeregistrations.push(
      await listen<string>("post", (event) => {
        let content = JSON.parse(event.payload);
        content.timestamp = new Date(content.timestamp);
        posts.push(content);
        posts = posts;
      })
    );
  });

  onDestroy(() => {
    listenerDeregistrations.forEach((fn) => {
      fn();
    });
  });

  function enterKeySubmission(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      postMessage();
    }
  }

  async function postMessage() {
    const doScroll = isScrolledToBottom(chatHistory);

    invoke('post', {message});
    posts.push({ nick: "Me", content: message, timestamp: new Date() });
    posts = posts;
    message = "";

    if (doScroll) {
      await tick();
      scrollToBottom(chatHistory);
    }
  }

  function isScrolledToBottom(element: HTMLElement) :boolean {
    // allow 1px inaccuracy by adding 1
    return element.scrollHeight - element.clientHeight <= element.scrollTop + 1
  }

  function scrollToBottom(element: HTMLElement) {
    element.scrollTop = element.scrollHeight - element.clientHeight
  }
</script>

<main class="container no-overflow">
  <div class="">
    <div bind:this={chatHistory} class="chat-history mx-3">
      {#each posts as post, index}
        <Post
          nick={post.nick}
          timestamp={post.timestamp}
          content={post.content}
          />
          <!-- isReply={index % 2 == 1} -->
      {/each}
      <div id="end-of-chat" />
    </div>
  </div>
  <div class="bottom-fixed columns">
    <textarea
      class="column is-three-quarters mr-2"
      bind:value={message}
      placeholder="Message"
      on:keydown={enterKeySubmission}
      rows="2"
    />
    <button class="column" on:click={postMessage}>Submit</button>
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
  .bottom-fixed textarea {
    resize: none;
  }
  .chat-history {
    height: calc(100vh - 90px);
    overflow: auto;

    border-bottom: solid 1px #777;
    padding-bottom: 10px;
  }
</style>
