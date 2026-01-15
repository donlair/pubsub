### Phased Implementation

Implement in this order (from `specs/SPECS.md`):

1. **Phase 1**: Type definitions (`src/types/`)
2. **Phase 2**: Internal infrastructure (`src/internal/message-queue.ts`)
3. **Phase 3**: Message class (`src/message.ts`)
4. **Phase 4**: Publisher components (`src/publisher/`)
5. **Phase 5**: Subscriber components (`src/subscriber/`)
6. **Phase 6**: Topic class (`src/topic.ts`)
7. **Phase 7**: Subscription class (`src/subscription.ts`)
8. **Phase 8**: PubSub client (`src/pubsub.ts`)
9. **Phase 9**: Integration tests
10. **Phase 10**: Advanced features (ordering, schemas)