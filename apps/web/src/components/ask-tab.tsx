"use client";

import { useState } from "react";
import {
  AlertCircleIcon,
  ArrowUpIcon,
  BotIcon,
  ChevronDownIcon,
  MessagesSquareIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@Bell/ui/components/alert";
import { Avatar, AvatarFallback } from "@Bell/ui/components/avatar";
import { Badge } from "@Bell/ui/components/badge";
import { Bubble, BubbleContent } from "@Bell/ui/components/bubble";
import { Button } from "@Bell/ui/components/button";
import { Card, CardContent } from "@Bell/ui/components/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@Bell/ui/components/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@Bell/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@Bell/ui/components/input-group";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@Bell/ui/components/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@Bell/ui/components/message-scroller";
import { Skeleton } from "@Bell/ui/components/skeleton";

const API = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

interface Citation {
  id: string;
  type: string;
  content: string;
  quote?: string;
  confidence?: number;
  relation?: string;
}

interface AssistantTurn {
  answer: string;
  citations: Citation[];
  inference: string[];
  missing: string[];
  confidence: number;
  synthesisMode?: string;
}

type Turn =
  { role: "user"; text: string } | ({ role: "assistant" } & AssistantTurn);

function asPercent(value: number | undefined): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return `${Math.min(100, Math.round(value * 100))}%`;
}

/**
 * Drop inline citation markers ([C1], [12], [fact], …) — citations live in
 * the dropdown. Only single-token brackets are stripped, so genuine
 * bracketed asides containing spaces are preserved.
 */
function stripCitationMarkers(text: string): string {
  return text
    .replace(/\s*\[[A-Za-z0-9_-]{1,20}\]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

export default function AskTab() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const question = draft.trim();
    if (!question || loading) return;
    setDraft("");
    setError(null);
    setTurns((prev) => [...prev, { role: "user", text: question }]);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, trace: true }),
      });
      const data = (await res.json()) as Partial<AssistantTurn> & {
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : `Request failed (${res.status})`,
        );
      }
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          answer: data.answer ?? "",
          citations: Array.isArray(data.citations)
            ? (data.citations as Citation[])
            : [],
          inference: Array.isArray(data.inference)
            ? (data.inference as string[])
            : [],
          missing: Array.isArray(data.missing)
            ? (data.missing as string[])
            : [],
          confidence: typeof data.confidence === "number" ? data.confidence : 0,
          synthesisMode: (data as { trace?: { synthesis?: { mode?: string } } })
            .trace?.synthesis?.mode,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport className="scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <MessageScrollerContent>
              {turns.length === 0 && !loading && (
                <Empty className="border-none">
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="rounded-2xl">
                      <MessagesSquareIcon />
                    </EmptyMedia>
                    <EmptyTitle className="text-2xl font-semibold">
                      What do you want to know?
                    </EmptyTitle>
                    <EmptyDescription>
                      Answers come back grounded in the team&apos;s docs, with
                      citations you can inspect.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {turns.map((turn, i) =>
                turn.role === "user" ? (
                  <MessageScrollerItem key={i}>
                    <Message align="end">
                      <MessageContent>
                        <Bubble align="end" variant="secondary">
                          <BubbleContent className="rounded-3xl bg-blue-600! px-4 text-white!">
                            {turn.text}
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ) : (
                  <MessageScrollerItem key={i}>
                    <Message align="start">
                      <MessageAvatar className="self-start">
                        <Avatar>
                          <AvatarFallback>
                            <BotIcon className="size-4" />
                          </AvatarFallback>
                        </Avatar>
                      </MessageAvatar>
                      <MessageContent>
                        <Bubble align="start" variant="ghost">
                          <BubbleContent className="max-w-2xl text-sm">
                            {stripCitationMarkers(turn.answer)}
                          </BubbleContent>
                        </Bubble>
                        <div className="flex flex-wrap items-center gap-1.5 px-1">
                          {asPercent(turn.confidence) && (
                            <Badge variant="secondary" className="rounded-full">
                              confidence {asPercent(turn.confidence)}
                            </Badge>
                          )}
                        </div>
                        {turn.citations.length > 0 && (
                          <Collapsible className="grid gap-2 px-1">
                            <CollapsibleTrigger
                              render={
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="w-fit rounded-lg"
                                >
                                  <ChevronDownIcon />
                                  Citations ({turn.citations.length})
                                </Button>
                              }
                            />
                            <CollapsibleContent className="grid gap-2 pt-1">
                              {turn.citations.map((c) => (
                                <Card
                                  key={c.id}
                                  className="rounded-2xl border-none bg-[#f4f4f3] shadow-none ring-0"
                                >
                                  <CardContent className="grid gap-1.5 p-4 text-xs">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {asPercent(c.confidence) && (
                                        <Badge
                                          variant="outline"
                                          className="rounded-full"
                                        >
                                          {asPercent(c.confidence)}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="leading-relaxed">
                                      {c.content}
                                    </p>
                                    {c.quote && (
                                      <blockquote className="border-l-2 pl-2 text-muted-foreground">
                                        {c.quote}
                                      </blockquote>
                                    )}
                                  </CardContent>
                                </Card>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                        {turn.inference.length > 0 && (
                          <Collapsible className="px-1">
                            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                              <ChevronDownIcon className="size-3.5" />
                              Inferences ({turn.inference.length})
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <ul className="list-disc space-y-1 pl-5 pt-1 text-xs text-muted-foreground">
                                {turn.inference.map((line, j) => (
                                  <li key={j}>{line}</li>
                                ))}
                              </ul>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ),
              )}
              {loading && (
                <MessageScrollerItem>
                  <Message align="start">
                    <MessageAvatar className="self-start">
                      <Avatar>
                        <AvatarFallback>
                          <BotIcon className="size-4" />
                        </AvatarFallback>
                      </Avatar>
                    </MessageAvatar>
                    <MessageContent>
                      <div className="grid w-full max-w-2xl gap-2">
                        <Skeleton className="h-4 w-3/4 rounded-full" />
                        <Skeleton className="h-4 w-full rounded-full" />
                        <Skeleton className="h-4 w-1/2 rounded-full" />
                      </div>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      {error && (
        <Alert variant="destructive" className="rounded-2xl">
          <AlertCircleIcon />
          <AlertTitle>Couldn&apos;t answer</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <InputGroup className="rounded-3xl bg-background p-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
        <InputGroupTextarea
          placeholder="Ask anything..."
          value={draft}
          rows={2}
          className="border-none bg-transparent px-4 shadow-none focus-visible:ring-0"
          onChange={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            variant="default"
            size="icon-sm"
            className="rounded-full"
            disabled={!draft.trim() || loading}
            onClick={() => void send()}
            aria-label="Send question"
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
