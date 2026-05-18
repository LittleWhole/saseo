"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ruby } from "@/components/ui/ruby";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";

import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useRouter } from "next/navigation";

interface SearchBarProps {
  searchPage?: boolean;
  initialQuery?: string;
  isSearching?: boolean;
  customFunction?: (query: string) => Promise<void> | void;
}

export function SearchBar({ searchPage, initialQuery = "", isSearching = false, customFunction }: SearchBarProps) {
  const router = useRouter();

  const formSchema = z.object({
    query: z.string().min(1).max(999),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      query: initialQuery,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (searchPage) {
      router.push(`/search?q=${encodeURIComponent(values.query)}`);
      customFunction?.(values.query);
    } else router.push(`/search?q=${encodeURIComponent(values.query)}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full">
      <div className="flex w-full items-center gap-2 rounded-full border border-stone-700/70 bg-stone-950/80 p-1.5 shadow-[0_18px_55px_rgba(0,0,0,0.28)] ring-1 ring-white/5 backdrop-blur">
        <FormField
          control={form.control}
          name="query"
          render={({ field }) => (
            <FormItem className="min-w-0 flex-grow">
              <FormControl>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
                  <Input
                    type="text"
                    placeholder="Search Korean, Hanja, Romaja, or English..."
                    className="h-12 rounded-full border-0 bg-transparent pl-11 pr-4 text-base text-stone-100 placeholder:text-stone-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                    {...field}
                  />
                </div>
              </FormControl>
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="h-12 flex-shrink rounded-full bg-emerald-300 px-5 text-sm font-semibold text-stone-950 shadow-[0_10px_25px_rgba(110,231,183,0.22)] hover:bg-emerald-200"
          aria-busy={isSearching}
        >
          {isSearching ? (
            <>
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
              <span>Searching</span>
            </>
          ) : (
            <>
              <span>Search&nbsp;</span>
              <span className="headword-script text-base leading-none">
                <Ruby text="檢" ruby="검" rtStyle={{ color: "#0c0a09" }} />
                <Ruby text="索" ruby="색" rtStyle={{ color: "#0c0a09" }} />
              </span>
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
        </div>
      </form>
    </Form>
  );
}
