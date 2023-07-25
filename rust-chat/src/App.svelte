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
    isReply: boolean;
  }

  let chatHistory: HTMLDivElement;
  let message: string = "";
  let pending: String[] = [];
  let posts: UserMessage[] = [];
  let users: Map<string, UserDetails> = new Map();
  const listenerDeregistrations: UnlistenFn[] = [];

  onMount(async () => {
    listenerDeregistrations.push(
      await listen<string>("post", async (event) => {
        const doScroll = isScrolledToBottom(chatHistory);
        let msg: UserMessage = JSON.parse(event.payload);
        msg.timestamp = new Date(msg.timestamp);
        addPost(msg);

        if (doScroll) {
          await tick();
          scrollToBottom(chatHistory);
        }
      })
    );

    const hist: string[] = await invoke("history", {start: 0});
    hist.forEach((raw) => {
      const msg = JSON.parse(raw);
      msg.timestamp = new Date(msg.timestamp);
      addPost(msg);
    });
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

  function addPost(content: UserMessage) {
    if (posts.length === 0) {
      content.isReply = false;
      posts.push(content);
    } else {
      const last = posts.at(-1);
      content.isReply = isMessageReply(last, content);
      posts.push(content);
      if (last.timestamp >= content.timestamp) {
        // We got a message out of order, sort and reset all messages.
        posts.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        posts.forEach( (msg, index, arr) => {
          if (index > 0) {
            const prev = arr[index-1];
            msg.isReply = isMessageReply(prev, content);
          }
        });
      }
    }
    posts = posts;
  }

  function isMessageReply(a: UserMessage, b: UserMessage): boolean {
    return a.nick === b.nick && Math.abs(a.timestamp.getTime() - b.timestamp.getTime()) / 1000 < 300;
  }

  async function postMessage() {
    const doScroll = isScrolledToBottom(chatHistory);

    invoke('post', {message});
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
          isReply={post.isReply}
          />
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
    max-width: inherit;
    padding: 0px 10px;
    width: -webkit-calc(100% - 20px);
    width:    -moz-calc(100% - 20px);
    width:         calc(100% - 20px);
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
