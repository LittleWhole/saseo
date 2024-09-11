"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useRouter } from "next/navigation";

export function SearchBar() {
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
      <div className="flex w-auto items-center place-content-center space-x-2 bg-gray-800 p-1 rounded-lg">
        <FormField
          control={form.control}
          name="query"
          render={({ field }) => (
            <FormItem className="flex-grow w-max">
              <FormControl>
                <Input
                  type="text"
                  placeholder="Type terms here..."
                  className="bg-gray-700"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="flex-shrink bg-gray-500 hover:bg-gray-600"
        >
          Search
        </Button>
        </div>
      </form>
    </Form>
  );
}
