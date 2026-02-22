"use client";

import { useDashboardData } from "@/contexts/data-context";
import { Button } from "@/components/ui/button";

export function TopicFilter() {
  const { allTopicInfos, selectedTopics, setSelectedTopics } = useDashboardData();

  const allSelected = selectedTopics.size === allTopicInfos.length;

  const toggleTopic = (topicName: string) => {
    const next = new Set(selectedTopics);
    if (next.has(topicName)) {
      next.delete(topicName);
    } else {
      next.add(topicName);
    }
    setSelectedTopics(next);
  };

  const selectAll = () => {
    setSelectedTopics(new Set(allTopicInfos.map((t) => t.name)));
  };

  const deselectAll = () => {
    setSelectedTopics(new Set());
  };

  return (
    <div className="flex-1 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">トピック</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={allSelected ? deselectAll : selectAll}
        >
          {allSelected ? "全解除" : "全選択"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {allTopicInfos.map((topic) => {
          const isSelected = selectedTopics.has(topic.name);
          return (
            <button
              key={topic.name}
              onClick={() => toggleTopic(topic.name)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                isSelected
                  ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 bg-transparent text-zinc-500"
              }`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: isSelected ? topic.color : "transparent",
                  border: isSelected ? "none" : `1px solid ${topic.color}`,
                }}
              />
              {topic.name}
              <span className="text-zinc-500">{topic.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
