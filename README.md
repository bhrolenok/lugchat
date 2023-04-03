# lugchat
Documentation and example code for a new group chat oriented protocol

The purpose of this repository is to document a **protocol** for a group chat oriented service with several guiding principles:

1. Creating a client/server implementation should be easy.
2. Security should follow best practices, but avoid complexity.
3. Data, when retained, should be easily exported and re-hosted. No server should "own" the data.
4. Creating implementations should be *fun*.

In addition, this repository contains proof of concept server and client implementations intended to follow the protocol and clarify any unintentional ambiguity. These are not *reference* implementations, and aren't intended to be scalable or in any way "customer ready."

Importantly, the description and discussion of this protocol are at least as important as any formal documentation or example code snippets. This project grew out of informal discussions in a group chat discussion, which migrated to a shared text document, and eventually ended up here.
