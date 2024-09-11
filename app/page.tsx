"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  const formSchema = z.object({
    query: z.string().min(1).max(999),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      query: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    router.push(`/search?q=${values.query}`);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-[family-name:var(--font-geist-sans)]">
      <h1 className="text-6xl font-bold mb-8">辭書 Saseo</h1>
      <div className="w-full max-w-2xl px-4">
        <div className="flex items-stretch">
          <div className="relative flex-grow">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <FormField
                  control={form.control}
                  name="query"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Type terms here..."
                          className="w-full pr-20 text-lg text-white"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="absolute right-0 text-lg top-0 bottom-0 rounded-l-none bg-white text-black hover:bg-gray-200"
                >
                  Search
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
